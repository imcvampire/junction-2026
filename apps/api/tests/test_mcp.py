import asyncio
import json
import re
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, cast

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.testclient import TestClient
from mcp import ClientSession
from mcp.client.session import ElicitationFnT
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.context import RequestContext
from mcp.types import CallToolResult, ElicitRequestFormParams, ElicitRequestParams, ElicitResult, ErrorData, TextContent

from api.agents.models import SHARED_AGENT_ID
from api.catalog.index import Catalog
from api.config import Settings
from api.main import create_app
from api.mcp.server import TOOL_NAMES
from tests.conftest import DELIVERY, FakeValio

SKILL_DIR = Path(__file__).resolve().parents[3] / "skills" / "valio-aimo-purchasing"
Body = Callable[[ClientSession, FastAPI], Awaitable[None]]


class Human:
    """The host's approval form: records each elicitation and answers with the queued replies."""

    def __init__(self) -> None:
        self.asked: list[ElicitRequestFormParams] = []
        self.replies: list[ElicitResult] = []

    def will(self, action: str = "accept", **content: str | bool) -> None:
        self.replies.append(ElicitResult(action=action, content=content or None))  # type: ignore[arg-type]

    async def __call__(
        self, context: RequestContext[ClientSession, Any], params: ElicitRequestParams
    ) -> ElicitResult | ErrorData:
        assert isinstance(params, ElicitRequestFormParams)
        self.asked.append(params)
        return self.replies.pop(0)


@asynccontextmanager
async def mcp_session(app: FastAPI, elicitation: ElicitationFnT | None = None) -> AsyncGenerator[ClientSession]:
    async with (
        streamable_http_client(app.state.mcp_url) as (read, write, _),
        ClientSession(read, write, elicitation_callback=elicitation) as session,
    ):
        await session.initialize()
        yield session


@asynccontextmanager
async def serving(app: FastAPI) -> AsyncGenerator[None]:
    """A real HTTP server: httpx's ASGI transport buffers whole responses, so a server request sent
    mid-call (elicitation) would never reach the client."""
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning"))
    task = asyncio.create_task(server.serve())
    while not server.started:
        if task.done():
            task.result()
        await asyncio.sleep(0.01)
    app.state.mcp_url = f"http://127.0.0.1:{server.servers[0].sockets[0].getsockname()[1]}/mcp"
    try:
        yield
    finally:
        server.should_exit = True
        await task


def run_mcp(settings: Settings, catalog: Catalog, fake: FakeValio, body: Body, human: Human | None = None) -> None:
    app = create_app(settings, catalog=catalog, valio_transport=httpx.MockTransport(fake.handler))

    async def main() -> None:
        async with serving(app), mcp_session(app, human) as session:
            await body(session, app)

    asyncio.run(asyncio.wait_for(main(), timeout=30))


def structured(result: CallToolResult) -> dict[str, Any]:
    assert not result.isError, result.content
    assert result.structuredContent is not None
    return result.structuredContent


def error_body(result: CallToolResult) -> dict[str, Any]:
    assert result.isError
    return json.loads(cast(TextContent, result.content[0]).text)


async def quote_milk(session: ClientSession, litres: float = 1000) -> dict[str, Any]:
    return structured(
        await session.call_tool(
            "quote",
            {
                "items": [
                    {"product_id": p, "amount": {"value": litres, "unit": "L"}} for p in ("462775", "464119", "464073")
                ],
                "delivery_date": DELIVERY.isoformat(),
                "requirements": ["LACTOSE_FREE"],
                "request_text": "I need 1,000 litres of lactose-free milk by Monday.",
            },
        )
    )


async def place_best(session: ClientSession, quote: dict[str, Any], ref: str = "ref-1") -> CallToolResult:
    best = next(o for o in quote["options"] if o["cheapest_covering_option"])
    return await session.call_tool(
        "place_order",
        {
            "quote_id": quote["quote_id"],
            "lines": [{"product_id": best["product_id"], "quantity": best["quantity"]}],
            "reason": "Cheapest lactose-free milk covering the date",
            "client_reference": ref,
        },
    )


def test_tools_are_listed_with_schemas_and_annotations(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(session: ClientSession, _: FastAPI) -> None:
        tools = {t.name: t for t in (await session.list_tools()).tools}
        assert set(tools) == set(TOOL_NAMES)
        assert all(t.outputSchema for t in tools.values())
        assert tools["get_order"].annotations and tools["get_order"].annotations.readOnlyHint
        place = tools["place_order"].annotations
        assert place and place.idempotentHint and not place.destructiveHint
        assert {"quote_id", "lines", "reason", "client_reference"} <= set(tools["place_order"].inputSchema["required"])

    run_mcp(settings, catalog, fake_valio, body)


def test_reference_request_escalates_then_approval_is_visible(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    human = Human()
    human.will(decision="approve", reason="gala dinner")

    async def body(session: ClientSession, app: FastAPI) -> None:
        me = structured(await session.call_tool("whoami", {}))
        assert me["spend_limit_eur"] == 500

        hits = structured(
            await session.call_tool("search_products", {"query": "milk", "required_tags": ["LACTOSE_FREE"]})
        )
        assert hits["count"] >= 3

        quote = await quote_milk(session)
        best = quote["options"][0]
        assert best["product_id"] == "464119" and best["quantity"] == 100 and best["cheapest_covering_option"]

        result = await place_best(session, quote)
        order = structured(result)
        assert order["status"] == "pending_approval"
        summary = cast(TextContent, result.content[0]).text
        assert "pending_approval" in summary and "spend limit" in summary

        queue = structured(await session.call_tool("list_pending_approvals", {}))
        assert [o["order_id"] for o in queue["orders"]] == [order["order_id"]]
        decided = await session.call_tool("approve_order", {"order_id": order["order_id"], "reason": "gala"})
        assert structured(decided)["decision"]["decided_by"]["name"] == me["name"]
        assert structured(decided)["decision"]["reason"] == "gala dinner"
        form = human.asked[0]
        assert order["order_id"] in form.message and "1540.00 EUR" in form.message and "spend limit" in form.message
        props = form.requestedSchema["properties"]
        assert props["decision"]["default"] == "approve" and props["decision"]["enum"] == ["approve", "reject"]
        assert props["reason"]["default"] == "gala"
        assert f"approved by {me['name']}" in cast(TextContent, decided.content[0]).text
        seen = structured(await session.call_tool("get_order", {"order_id": order["order_id"]}))
        assert seen["status"] == "approved" and seen["decision"]["decided_by"]["agent_id"] == me["agent_id"]
        audit = structured(await session.call_tool("get_order_audit", {"order_id": order["order_id"]}))
        assert "options considered" in audit["text"] and f"Approved by {me['name']} (agt_" in audit["text"]
        assert "confirmed via: mcp_elicitation" in audit["text"]
        listed = structured(await session.call_tool("list_orders", {"status": "approved"}))
        assert [o["order_id"] for o in listed["orders"]] == [order["order_id"]]

    run_mcp(settings, catalog, fake_valio, body, human)


def test_every_mcp_and_rest_client_is_the_same_shared_agent(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(session: ClientSession, app: FastAPI) -> None:
        me = structured(await session.call_tool("whoami", {}))
        assert me["agent_id"] == SHARED_AGENT_ID and me["customer"] == settings.valio_customer
        order = structured(await place_best(session, await quote_milk(session)))
        assert order["status"] == "pending_approval"
        human = Human()
        human.will(decision="reject", reason="no")
        async with mcp_session(app, human) as other:
            assert structured(await other.call_tool("whoami", {}))["agent_id"] == SHARED_AGENT_ID
            tools = {t.name: t for t in (await other.list_tools()).tools}
            for name in ("approve_order", "reject_order"):
                hints = tools[name].annotations
                assert hints and hints.destructiveHint and not hints.readOnlyHint
                assert tools[name].inputSchema["required"] == ["order_id"]
            mine = structured(await other.call_tool("list_orders", {}))
            assert [o["order_id"] for o in mine["orders"]] == [order["order_id"]]
            rejected = structured(await other.call_tool("reject_order", {"order_id": order["order_id"]}))
            assert rejected["status"] == "rejected"
            assert rejected["decision"]["decided_by"]["agent_id"] == SHARED_AGENT_ID

        http = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        async with http:
            path = f"/api/agent/v1/orders/{order['order_id']}"
            same = await http.get(path)
            assert same.status_code == 200 and same.json()["status"] == "rejected"

    run_mcp(settings, catalog, fake_valio, body)


def test_shared_agent_follows_the_configured_customer_and_mandate(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    cfg = settings.model_copy(
        update={"valio_customer": "hotel-2", "required_tags": [" LACTOSE_FREE "], "banned_allergens": ["am"]}
    )
    app = create_app(cfg, catalog=catalog, valio_transport=httpx.MockTransport(fake_valio.handler))
    with TestClient(app) as c:
        me = c.get("/api/agent/v1/me").json()
    assert (me["agent_id"], me["customer"]) == (SHARED_AGENT_ID, "hotel-2")
    assert me["required_tags"] == ["LACTOSE_FREE"] and me["banned_allergens"] == ["AM"]
    assert me["spend_limit_eur"] == settings.approval_spend_threshold_eur


def test_order_within_authority_is_placed(settings: Settings, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(session: ClientSession, _: FastAPI) -> None:
        order = structured(await place_best(session, await quote_milk(session, litres=100)))
        assert order["status"] == "placed" and order["total"] == 154.0

    run_mcp(settings, catalog, fake_valio, body)


def test_refusals_are_tool_errors_with_codes(settings: Settings, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(session: ClientSession, _: FastAPI) -> None:
        quote = await quote_milk(session, litres=100)
        fake_valio.prices["464119"] = 16.0
        assert error_body(await place_best(session, quote))["code"] == "quote_changed"

        bad = await session.call_tool("quote", {"items": [], "delivery_date": DELIVERY.isoformat()})
        assert error_body(bad)["code"] == "invalid_arguments"
        schema = error_body(await session.call_tool("place_order", {"quote_id": quote["quote_id"]}))
        assert schema["code"] == "invalid_arguments"
        assert {e["field"] for e in schema["details"]["errors"]} >= {"lines", "reason", "client_reference"}
        missing = await session.call_tool("get_order", {"order_id": "ord_nope"})
        assert error_body(missing)["code"] == "order_not_found"

    run_mcp(settings, catalog, fake_valio, body)


def test_mcp_needs_no_key_but_rejects_foreign_origins(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    app = create_app(settings, catalog=catalog, valio_transport=httpx.MockTransport(fake_valio.handler))
    init: dict[str, Any] = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
    headers = {"Accept": "application/json, text/event-stream"}
    with TestClient(app) as c:
        assert c.post("/mcp", json=init, headers=headers).status_code != 401
        assert c.post("/mcp", json=init, headers={**headers, "Origin": "https://evil.example"}).status_code == 403


def test_skill_mentions_only_real_tools() -> None:
    text = "\n".join(p.read_text() for p in SKILL_DIR.rglob("*.md"))
    mentioned = set(re.findall(r"`([a-z_]+)`", text)) & {
        "whoami",
        "search_products",
        "get_product",
        "quote",
        "place_order",
        "get_order",
        "list_orders",
        "get_order_audit",
        "list_pending_approvals",
        "approve_order",
        "reject_order",
        "cancel_order",
        "get_order_status",
        "create_order_draft",
        "agree_order",
    }
    assert mentioned == set(TOOL_NAMES)


async def pending(session: ClientSession) -> dict[str, Any]:
    order = structured(await place_best(session, await quote_milk(session)))
    assert order["status"] == "pending_approval"
    return order


def test_a_client_without_elicitation_cannot_decide(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(session: ClientSession, _: FastAPI) -> None:
        order = await pending(session)
        for tool in ("approve_order", "reject_order"):
            res = await session.call_tool(tool, {"order_id": order["order_id"], "reason": "ok"})
            assert error_body(res)["code"] == "elicitation_required"
        seen = structured(await session.call_tool("get_order", {"order_id": order["order_id"]}))
        assert seen["status"] == "pending_approval"

    run_mcp(settings, catalog, fake_valio, body)


def test_the_human_decides_in_the_form_not_the_tool_call(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    human = Human()
    human.will(decision="reject", reason="Too much milk for one week")

    async def body(session: ClientSession, _: FastAPI) -> None:
        order = await pending(session)
        calls = len(fake_valio.calls)
        res = structured(await session.call_tool("approve_order", {"order_id": order["order_id"], "reason": "yes"}))
        assert res["status"] == "rejected" and res["decision"]["reason"] == "Too much milk for one week"
        assert len(fake_valio.calls) == calls + 2  # only the re-check before the form; a rejection is not re-checked
        audit = structured(await session.call_tool("get_order_audit", {"order_id": order["order_id"]}))
        assert audit["entries"][-1]["details"]["confirmed_via"] == "mcp_elicitation"

    run_mcp(settings, catalog, fake_valio, body, human)


def test_declining_or_cancelling_the_form_decides_nothing(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    human = Human()
    human.will("decline")
    human.will("cancel")

    async def body(session: ClientSession, _: FastAPI) -> None:
        order = await pending(session)
        for tool, action in (("approve_order", "decline"), ("reject_order", "cancel")):
            err = error_body(await session.call_tool(tool, {"order_id": order["order_id"]}))
            assert err["code"] == "decision_cancelled" and err["details"] == {"action": action}
        assert "Approve order" in human.asked[0].message and "Reject order" in human.asked[1].message
        assert human.asked[1].requestedSchema["properties"]["decision"]["default"] == "reject"
        seen = structured(await session.call_tool("get_order", {"order_id": order["order_id"]}))
        assert seen["status"] == "pending_approval"

    run_mcp(settings, catalog, fake_valio, body, human)


def test_the_human_may_approve_without_a_reason(settings: Settings, catalog: Catalog, fake_valio: FakeValio) -> None:
    human = Human()
    human.will(decision="approve")

    async def body(session: ClientSession, _: FastAPI) -> None:
        order = await pending(session)
        res = structured(await session.call_tool("approve_order", {"order_id": order["order_id"]}))
        assert res["status"] == "approved" and res["decision"]["reason"] == ""
        assert "reason" not in human.asked[0].requestedSchema.get("required", [])

    run_mcp(settings, catalog, fake_valio, body, human)


def test_a_price_change_is_confirmed_in_the_same_form(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    human = Human()
    human.will(decision="approve", reason="Still fine at the new price")

    async def body(session: ClientSession, _: FastAPI) -> None:
        order = await pending(session)
        fake_valio.prices["464119"] = 16.0
        res = structured(await session.call_tool("approve_order", {"order_id": order["order_id"]}))
        assert res["status"] == "approved" and res["total"] == 1600.0
        message = human.asked[0].message
        assert "PRICE CHANGED" in message and "464119 15.40 -> 16.00" in message and "1600.00 EUR" in message
        assert human.asked[0].requestedSchema["properties"]["reason"]["default"] == ""
        audit = structured(await session.call_tool("get_order_audit", {"order_id": order["order_id"]}))
        assert [e["action"] for e in audit["entries"]] == ["escalated", "repriced", "approved"]

    run_mcp(settings, catalog, fake_valio, body, human)


def test_stock_change_closes_the_order_without_a_form(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    human = Human()

    async def body(session: ClientSession, _: FastAPI) -> None:
        order = await pending(session)
        fake_valio.stock["464119"] = 5
        err = error_body(await session.call_tool("approve_order", {"order_id": order["order_id"]}))
        assert err["code"] == "stock_changed" and err["details"]["rerun"]["delivery_date"] == DELIVERY.isoformat()
        assert human.asked == []
        seen = structured(await session.call_tool("get_order", {"order_id": order["order_id"]}))
        assert seen["status"] == "rejected" and seen["decision"]["decided_by"] is None

    run_mcp(settings, catalog, fake_valio, body, human)


def test_decided_and_unknown_orders_are_answered_without_a_form(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    human = Human()
    human.will(decision="approve", reason="gala")

    async def body(session: ClientSession, app: FastAPI) -> None:
        order = await pending(session)
        first = structured(await session.call_tool("approve_order", {"order_id": order["order_id"]}))
        again = structured(await session.call_tool("approve_order", {"order_id": order["order_id"]}))
        assert again == first and len(human.asked) == 1
        late = error_body(await session.call_tool("reject_order", {"order_id": order["order_id"], "reason": "no"}))
        assert late["code"] == "invalid_state"

        err = error_body(await session.call_tool("approve_order", {"order_id": "ord_unknown"}))
        assert err["code"] == "order_not_found" and len(human.asked) == 1

    run_mcp(settings, catalog, fake_valio, body, human)


def test_quote_carries_the_buyers_purpose(settings: Settings, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(session: ClientSession, _: FastAPI) -> None:
        quote = structured(
            await session.call_tool(
                "quote",
                {
                    "items": [{"product_id": "464073", "quantity": 10}],
                    "delivery_date": DELIVERY.isoformat(),
                    "purpose": "baking",
                },
            )
        )
        assert quote["purpose"] == "baking"
        order = structured(await place_best(session, quote))
        assert order["purpose"] == "baking"

    run_mcp(settings, catalog, fake_valio, body)


async def console(app: FastAPI, order_id: str, action: str) -> httpx.Response:
    """The order console, over the same live server the MCP session uses."""
    async with httpx.AsyncClient(base_url=app.state.mcp_url.removesuffix("/mcp")) as http:
        return await http.post(f"/api/orders/{order_id}/{action}", json={})


async def placed(session: ClientSession, ref: str) -> dict[str, Any]:
    order = structured(await place_best(session, await quote_milk(session, litres=10), ref))
    assert order["status"] == "placed"
    return order


async def approved(session: ClientSession, ref: str = "ref-1") -> dict[str, Any]:
    order = structured(await place_best(session, await quote_milk(session), ref))
    res = await session.call_tool("approve_order", {"order_id": order["order_id"]})
    assert structured(res)["status"] == "approved"
    return order


def test_a_placed_or_shipped_order_is_answered_without_a_form(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(session: ClientSession, app: FastAPI) -> None:
        order = await placed(session, "a")
        res = structured(await session.call_tool("cancel_order", {"order_id": order["order_id"], "reason": "no event"}))
        assert res["status"] == "cancelled" and res["cancellation"]["confirmed_via"] == "agent"
        listed = structured(await session.call_tool("list_orders", {"status": "cancelled"}))
        assert [o["order_id"] for o in listed["orders"]] == [order["order_id"]]

        other = await placed(session, "b")
        assert (await console(app, other["order_id"], "ship")).status_code == 200
        err = error_body(await session.call_tool("cancel_order", {"order_id": other["order_id"], "reason": "x"}))
        assert err["code"] == "already_shipped"
        listed = structured(await session.call_tool("list_orders", {"status": "shipped"}))
        assert [o["order_id"] for o in listed["orders"]] == [other["order_id"]]

    run_mcp(settings, catalog, fake_valio, body)


def test_an_approved_order_is_cancelled_by_the_human_in_the_form(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    human = Human()
    human.will(decision="approve", reason="gala")
    human.will("decline")
    human.will(confirm=False, reason="keep it")
    human.will(confirm=True, reason="Gala moved to spring")

    async def body(session: ClientSession, _: FastAPI) -> None:
        order = await approved(session)
        args = {"order_id": order["order_id"], "reason": "buyer says the gala is off"}
        for action in ("decline", "accept"):
            err = error_body(await session.call_tool("cancel_order", args))
            assert err["code"] == "cancel_declined" and err["details"] == {"action": action}
        seen = structured(await session.call_tool("get_order", {"order_id": order["order_id"]}))
        assert seen["status"] == "approved"

        res = structured(await session.call_tool("cancel_order", args))
        assert res["status"] == "cancelled"
        assert res["cancellation"]["reason"] == "Gala moved to spring"
        assert res["cancellation"]["confirmed_via"] == "mcp_elicitation"
        form = human.asked[1]
        assert "Cancel approved order" in form.message and "undoes the approval" in form.message
        assert form.requestedSchema["properties"]["reason"]["default"] == "buyer says the gala is off"
        audit = structured(await session.call_tool("get_order_audit", {"order_id": order["order_id"]}))
        assert audit["entries"][-1]["actor"] == "approver"

    run_mcp(settings, catalog, fake_valio, body, human)


def test_a_client_without_elicitation_cannot_cancel_an_approved_order(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(session: ClientSession, app: FastAPI) -> None:
        order = structured(await place_best(session, await quote_milk(session)))
        assert (await console(app, order["order_id"], "approve")).status_code == 200
        err = error_body(await session.call_tool("cancel_order", {"order_id": order["order_id"], "reason": "x"}))
        assert err["code"] == "elicitation_required"
        seen = structured(await session.call_tool("get_order", {"order_id": order["order_id"]}))
        assert seen["status"] == "approved"

    run_mcp(settings, catalog, fake_valio, body)


def test_replacing_an_approved_order_skips_the_form(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    human = Human()
    human.will(decision="approve", reason="gala")

    async def body(session: ClientSession, _: FastAPI) -> None:
        old = await approved(session, "old")
        pending = structured(await place_best(session, await quote_milk(session), "pending"))
        args = {"order_id": old["order_id"], "reason": "buyer wants 10 L instead"}
        err = error_body(await session.call_tool("cancel_order", {**args, "replaced_by": pending["order_id"]}))
        assert err["code"] == "replacement_pending"
        seen = structured(await session.call_tool("get_order", {"order_id": old["order_id"]}))
        assert seen["status"] == "approved"

        new = await placed(session, "new")
        res = structured(await session.call_tool("cancel_order", {**args, "replaced_by": new["order_id"]}))
        assert res["status"] == "cancelled" and res["cancellation"]["confirmed_via"] == "replacement"
        assert res["cancellation"]["replaced_by"] == new["order_id"]
        assert len(human.asked) == 1

    run_mcp(settings, catalog, fake_valio, body, human)


def test_a_blank_replacement_still_asks_the_human(settings: Settings, catalog: Catalog, fake_valio: FakeValio) -> None:
    human = Human()
    human.will(decision="approve", reason="gala")
    human.will(confirm=True, reason="   ")

    async def body(session: ClientSession, _: FastAPI) -> None:
        order = await approved(session)
        args = {"order_id": order["order_id"], "reason": "gala is off", "replaced_by": "  "}
        res = structured(await session.call_tool("cancel_order", args))
        assert len(human.asked) == 2 and res["cancellation"]["confirmed_via"] == "mcp_elicitation"
        assert res["cancellation"]["reason"] == "gala is off" and res["cancellation"]["replaced_by"] is None

    run_mcp(settings, catalog, fake_valio, body, human)
