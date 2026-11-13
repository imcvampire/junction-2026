import json
from typing import Any

from fastapi.testclient import TestClient

from api.agent.loop import ChatEvent, LLMUnavailableError, ReasoningDelta, TextDelta, ToolCall, UsageReport
from tests.conftest import DELIVERY, ScriptedChatModel, parse_sse


def _call(name: str, args: dict[str, Any], call_id: str) -> ToolCall:
    return ToolCall(call_id, name, json.dumps(args))


def _turn(client: TestClient, session_id: str, text: str) -> tuple[list[tuple[str, dict[str, Any]]], dict[str, Any]]:
    res = client.post(f"/api/conversations/{session_id}/turns", json={"text": text})
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(res.text)
    final = [data for name, data in events if name == "turn"]
    assert len(final) == 1
    return events, final[0]


def test_milk_order_runs_search_quote_draft_confirm_and_offers_ar(client: TestClient, chat: ScriptedChatModel) -> None:
    session_id = client.post("/api/conversations", json={"language": "en"}).json()["session_id"]
    chat.rounds = [
        [
            TextDelta("Let me check. "),
            _call("search_products", {"query": "milk", "required_tags": ["LACTOSE_FREE"]}, "c1"),
        ],
        [
            _call(
                "quote",
                {"items": [{"product_id": "462921", "quantity": 200}], "delivery_date": DELIVERY.isoformat()},
                "c2",
            )
        ],
        [
            _call(
                "create_order_draft",
                {
                    "delivery_date": DELIVERY.isoformat(),
                    "lines": [{"product_id": "462921", "quantity": 200}],
                    "preferences": ["LACTOSE_FREE"],
                    "candidates_considered": [{"product_id": "462921"}, {"product_id": "464119"}],
                    "reason": "1000 l = 200 cases of 5 l",
                },
                "c3",
            )
        ],
        [
            TextDelta("Valio Eila organic, 200 cases of 5 litres, 2194 euros for Monday. "),
            TextDelta("Shall I go ahead?"),
            UsageReport(900, 40),
        ],
    ]

    events, turn1 = _turn(client, session_id, "I need 1,000 litres of lactose-free milk by Monday")

    assert [name for name, _ in events if name == "tool"] == ["tool", "tool", "tool"]
    assert turn1["flow_state"] == "confirming"
    assert turn1["reply_text"].startswith("Let me check.")
    assert "Shall I go ahead?" in turn1["reply_text"]
    assert turn1["offers"][0]["product_id"] == "462921" and turn1["offers"][0]["unit_price"] == 10.97
    assert turn1["order"]["status"] == "draft"
    order_id = turn1["order"]["id"]
    tool_messages = [m for m in chat.seen[-1] if m["role"] == "tool"]
    assert [json.loads(m["content"]).get("error") for m in tool_messages] == [None, None, None]

    chat.rounds = [
        [_call("agree_order", {"order_id": order_id}, "c4")],
        [TextDelta("Agreed. It needs about three pallets. Want to see it in your storage room?")],
    ]
    _, turn2 = _turn(client, session_id, "Yes, go ahead")
    assert turn2["flow_state"] == "ar_offered"
    assert turn2["actions"] == [{"type": "offer_ar", "order_id": order_id}]
    assert turn2["order"]["status"] == "agreed"

    chat.rounds = [
        [_call("place_order", {"order_id": order_id}, "c5")],
        [TextDelta("That is over your 500 euro limit, so it is waiting for approval.")],
    ]
    _, turn3 = _turn(client, session_id, "Looks fine, place it")
    assert turn3["flow_state"] == "escalated"
    assert turn3["order"]["status"] == "pending_approval"

    audit = client.get(f"/api/orders/{order_id}/audit").json()
    assert audit[0]["details"]["request"].startswith("I need 1,000 litres")
    assert audit[1]["summary"] == "Buyer said: Yes, go ahead"


def test_system_prompt_carries_date_stage_and_threshold(client: TestClient, chat: ScriptedChatModel) -> None:
    session_id = client.post("/api/conversations", json={"language": "fi"}).json()["session_id"]
    chat.rounds = [[TextDelta("Kuinka paljon?")]]
    _turn(client, session_id, "Tarvitsen maitoa")
    system = chat.seen[0][0]["content"]
    assert "Finnish" in system and "gathering" in system and "500 EUR" in system


def test_reply_falls_back_to_reasoning_content(client: TestClient, chat: ScriptedChatModel) -> None:
    session_id = client.post("/api/conversations", json={}).json()["session_id"]
    chat.rounds = [[ReasoningDelta("How many litres "), ReasoningDelta("do you need?")]]
    _, turn = _turn(client, session_id, "milk please")
    assert turn["reply_text"] == "How many litres do you need?"


def test_tool_rounds_are_capped(client: TestClient, chat: ScriptedChatModel, settings: Any) -> None:
    session_id = client.post("/api/conversations", json={}).json()["session_id"]
    rounds = settings.llm_max_tool_rounds
    scripted: list[list[ChatEvent]] = [[_call("search_products", {"query": "milk"}, f"c{i}")] for i in range(rounds)]
    chat.rounds = [*scripted, [TextDelta("Here is what I found.")]]
    _, turn = _turn(client, session_id, "milk")
    assert chat.offered_tools == [True] * rounds + [False]
    assert turn["reply_text"] == "Here is what I found."


def test_llm_outage_yields_error_event_and_spoken_apology(client: TestClient, chat: ScriptedChatModel) -> None:
    session_id = client.post("/api/conversations", json={}).json()["session_id"]
    chat.error = LLMUnavailableError("down")
    events, turn = _turn(client, session_id, "milk")
    assert ("error", {"code": "llm_unavailable", "message": "down"}) in events
    assert turn["reply_text"].startswith("Sorry")


def test_unknown_session_is_404(client: TestClient) -> None:
    assert client.post("/api/conversations/ses_nope/turns", json={"text": "hi"}).status_code == 404


def test_turns_are_rate_limited_per_session(client: TestClient, chat: ScriptedChatModel, settings: Any) -> None:
    session_id = client.post("/api/conversations", json={}).json()["session_id"]
    chat.rounds = [[TextDelta("ok")] for _ in range(settings.turns_per_minute)]
    for _ in range(settings.turns_per_minute):
        _turn(client, session_id, "hi")
    res = client.post(f"/api/conversations/{session_id}/turns", json={"text": "hi"})
    assert res.status_code == 429


def test_voice_endpoints_report_unconfigured_provider(client: TestClient) -> None:
    assert client.get("/api/voice").json() == {"server_voice": False}
    res = client.post("/api/voice/transcribe", files={"audio": ("a.webm", b"x", "audio/webm")})
    assert res.status_code == 503
    assert client.post("/api/voice/speak", json={"text": "hi"}).status_code == 503


def test_ar_endpoints_serve_glb_and_footprint(client: TestClient) -> None:
    order = client.post(
        "/api/orders",
        json={"delivery_date": DELIVERY.isoformat(), "lines": [{"product_id": "462921", "quantity": 50}]},
    ).json()
    fp = client.get(f"/api/orders/{order['id']}/footprint").json()
    assert fp["pallets"] == 3 and fp["renderable"]
    glb = client.get(f"/api/orders/{order['id']}/ar-model.glb")
    assert glb.headers["content-type"] == "model/gltf-binary"
    assert glb.content[:4] == b"glTF"


def test_session_keeps_the_order_when_a_turn_crashes(client: TestClient, chat: ScriptedChatModel) -> None:
    session_id = client.post("/api/conversations", json={}).json()["session_id"]
    draft = {
        "delivery_date": DELIVERY.isoformat(),
        "lines": [{"product_id": "462921", "quantity": 2}],
        "reason": "test",
    }
    chat.rounds = [[_call("create_order_draft", draft, "c1")]]
    chat.error_after_rounds = RuntimeError("model client bug")
    events, _ = parse_sse(client.post(f"/api/conversations/{session_id}/turns", json={"text": "2 cases"}).text), None
    assert events[-1][0] == "error"
    assert client.get(f"/api/conversations/{session_id}").json()["order_id"] is not None
