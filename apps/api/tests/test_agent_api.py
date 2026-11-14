from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import DELIVERY, AgentFactory, FakeValio, bearer, services_of


def _quote(client: TestClient, key: str, quantity: float = 100, product_id: str = "462775") -> dict[str, Any]:
    res = client.post(
        "/api/agent/v1/quotes",
        headers=bearer(key),
        json={
            "items": [{"product_id": product_id, "quantity": quantity}],
            "delivery_date": DELIVERY.isoformat(),
            "requirements": ["LACTOSE_FREE"],
            "request_text": "I need lactose-free milk by Monday",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _order(client: TestClient, key: str, quote: dict[str, Any], ref: str = "r1") -> Any:
    option = quote["options"][0]
    return client.post(
        "/api/agent/v1/orders",
        headers=bearer(key),
        json={
            "quote_id": quote["quote_id"],
            "lines": [{"product_id": option["product_id"], "quantity": option["quantity"]}],
            "reason": "Cheapest lactose-free option",
            "client_reference": ref,
        },
    )


def test_agent_routes_require_a_valid_enabled_key(client: TestClient, make_agent: AgentFactory) -> None:
    missing = client.get("/api/agent/v1/me")
    assert missing.status_code == 401
    assert missing.headers["WWW-Authenticate"].startswith("Bearer")
    assert missing.json()["code"] == "unauthorized"
    assert client.get("/api/agent/v1/me", headers=bearer("vaa_nope")).status_code == 401

    principal, key = make_agent()
    services_of(client).agents.set_disabled(principal.agent_id)
    assert client.get("/api/agent/v1/me", headers=bearer(key)).status_code == 401


def test_me_reports_authority(client: TestClient, make_agent: AgentFactory) -> None:
    _, key = make_agent(spend_limit_eur=250, required_tags=["LACTOSE_FREE"])
    me = client.get("/api/agent/v1/me", headers=bearer(key)).json()
    assert me["spend_limit_eur"] == 250 and me["spend_limit_source"] == "agent mandate"
    assert me["required_tags"] == ["LACTOSE_FREE"]


def test_search_and_product_lookup(client: TestClient, agent_key: str) -> None:
    hits = client.get(
        "/api/agent/v1/products", headers=bearer(agent_key), params={"q": "milk", "tag": "LACTOSE_FREE"}
    ).json()
    assert hits["count"] >= 3 and all("LACTOSE_FREE" in p["tags"] for p in hits["products"])
    product = client.get("/api/agent/v1/products/464119", headers=bearer(agent_key)).json()
    assert product["content_per_sales_unit"] == "10 L" and product["allergens"] == {"AM": "milk"}
    assert client.get("/api/agent/v1/products/nope", headers=bearer(agent_key)).status_code == 404


def test_quote_to_placed_order_with_audit(client: TestClient, agent_key: str) -> None:
    quote = _quote(client, agent_key)
    assert client.get(f"/api/agent/v1/quotes/{quote['quote_id']}", headers=bearer(agent_key)).status_code == 200

    res = _order(client, agent_key, quote)
    assert res.status_code == 201, res.text
    order = res.json()
    assert order["status"] == "placed" and order["total"] == 257.0

    listed = client.get("/api/agent/v1/orders", headers=bearer(agent_key), params={"status": "placed"}).json()
    assert [o["order_id"] for o in listed["orders"]] == [order["order_id"]]
    text = client.get(f"/api/agent/v1/orders/{order['order_id']}/audit.txt", headers=bearer(agent_key)).text
    assert "Agent hotel-agent" in text and "options considered" in text


def _escalated(client: TestClient, key: str, ref: str = "big") -> dict[str, Any]:
    order = _order(client, key, _quote(client, key, quantity=400), ref).json()
    assert order["status"] == "pending_approval"
    return order


def test_escalation_is_decided_through_any_customer_key_and_visible_to_the_agent(
    client: TestClient, agent_key: str, make_agent: AgentFactory
) -> None:
    order = _escalated(client, agent_key)
    assert "spend limit" in order["approval_reasons"][0]
    ops, ops_key = make_agent("ops")

    queue = client.get("/api/agent/v1/approvals", headers=bearer(ops_key)).json()
    assert [o["order_id"] for o in queue["orders"]] == [order["order_id"]]
    company = client.get("/api/agent/v1/orders", headers=bearer(ops_key), params={"scope": "company"}).json()
    assert [o["order_id"] for o in company["orders"]] == [order["order_id"]]

    url = f"/api/agent/v1/orders/{order['order_id']}/approve"
    res = client.post(url, headers={**bearer(ops_key), "Idempotency-Key": "k1"}, json={"reason": "gala"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"]["decided_by"] == {"agent_id": ops.agent_id, "name": "ops"}
    again = client.post(url, headers={**bearer(ops_key), "Idempotency-Key": "k1"}, json={"reason": "gala"})
    assert again.json() == res.json()
    reject = client.post(
        f"/api/agent/v1/orders/{order['order_id']}/reject", headers=bearer(ops_key), json={"reason": "late"}
    )
    assert reject.status_code == 409 and reject.json()["code"] == "invalid_state"

    seen = client.get(f"/api/agent/v1/orders/{order['order_id']}", headers=bearer(agent_key)).json()
    assert seen["status"] == "approved" and seen["decision"]["decided_by"]["agent_id"] == ops.agent_id
    audit = client.get(f"/api/agent/v1/orders/{order['order_id']}/audit", headers=bearer(agent_key)).json()
    assert [(e["actor"], e["agent_id"]) for e in audit["entries"]][-1] == ("approver", ops.agent_id)
    assert len(audit["entries"]) == 2


def test_the_placing_key_relays_its_buyers_decision(client: TestClient, agent_key: str) -> None:
    order = _escalated(client, agent_key)
    res = client.post(
        f"/api/agent/v1/orders/{order['order_id']}/reject", headers=bearer(agent_key), json={"reason": "too much"}
    )
    assert res.status_code == 200 and res.json()["status"] == "rejected"


def test_foreign_keys_cannot_decide_and_a_reason_is_required(client: TestClient, make_agent: AgentFactory) -> None:
    _, member = make_agent()
    _, rival = make_agent("rival", customer="hotel-2")
    order = _escalated(client, member)

    foreign = client.post(
        f"/api/agent/v1/orders/{order['order_id']}/approve", headers=bearer(rival), json={"reason": "x"}
    )
    assert foreign.status_code == 404 and foreign.json()["code"] == "order_not_found"
    assert client.get("/api/agent/v1/approvals", headers=bearer(rival)).json()["orders"] == []
    blank = client.post(
        f"/api/agent/v1/orders/{order['order_id']}/approve", headers=bearer(member), json={"reason": " "}
    )
    assert blank.status_code == 422 and blank.json()["code"] == "reason_required"
    empty = client.post(f"/api/agent/v1/orders/{order['order_id']}/approve", headers=bearer(member), json={})
    assert empty.status_code == 422


def test_console_routes_require_a_key_of_the_customer(
    client: TestClient, agent_key: str, make_agent: AgentFactory
) -> None:
    order = _escalated(client, agent_key)
    _, ops = make_agent("ops")
    _, rival = make_agent("rival", customer="hotel-2")
    url = f"/api/orders/{order['order_id']}"

    missing = client.post(f"{url}/approve", json={"reason": "ok"})
    assert missing.status_code == 401 and missing.headers["WWW-Authenticate"].startswith("Bearer")
    assert client.get(url).status_code == 401
    assert client.get(url, headers=bearer(rival)).status_code == 404
    assert client.post(f"{url}/approve", headers=bearer(rival), json={"reason": "ok"}).status_code == 404

    assert client.get(url, headers=bearer(ops)).json()["status"] == "pending_approval"
    res = client.post(f"{url}/approve", headers={**bearer(ops), "Idempotency-Key": "c1"}, json={"reason": "ok"})
    assert res.status_code == 200 and res.json()["decision"]["decided_by"]["name"] == "ops"
    again = client.post(f"{url}/approve", headers={**bearer(ops), "Idempotency-Key": "c1"}, json={"reason": "ok"})
    assert again.json() == res.json()
    assert client.post(f"{url}/reject", headers=bearer(ops), json={"reason": "no"}).status_code == 409
    assert [e["action"] for e in client.get(f"{url}/audit", headers=bearer(ops)).json()] == ["escalated", "approved"]
    assert "Approved by ops" in client.get(f"{url}/audit.txt", headers=bearer(ops)).text


def test_quote_changed_is_409_and_creates_nothing(client: TestClient, agent_key: str, fake_valio: FakeValio) -> None:
    quote = _quote(client, agent_key)
    fake_valio.prices["462775"] = 2.99
    res = _order(client, agent_key, quote)
    assert res.status_code == 409 and res.json()["code"] == "quote_changed"
    assert client.get("/api/agent/v1/orders", headers=bearer(agent_key)).json()["orders"] == []


def test_quotes_stay_with_their_agent_and_orders_with_their_customer(
    client: TestClient, make_agent: AgentFactory
) -> None:
    _, key = make_agent("a")
    _, colleague = make_agent("b")
    _, rival = make_agent("c", customer="hotel-2")
    quote = _quote(client, key)
    order = _order(client, key, quote).json()
    assert client.get(f"/api/agent/v1/orders/{order['order_id']}", headers=bearer(colleague)).status_code == 200
    assert client.get(f"/api/agent/v1/orders/{order['order_id']}", headers=bearer(rival)).status_code == 404
    assert client.get(f"/api/agent/v1/quotes/{quote['quote_id']}", headers=bearer(colleague)).status_code == 404
    assert _order(client, colleague, quote).status_code == 404


def test_idempotency_key_must_match_client_reference(client: TestClient, agent_key: str) -> None:
    quote = _quote(client, agent_key)
    option = quote["options"][0]
    res = client.post(
        "/api/agent/v1/orders",
        headers={**bearer(agent_key), "Idempotency-Key": "other"},
        json={
            "quote_id": quote["quote_id"],
            "lines": [{"product_id": option["product_id"], "quantity": 1}],
            "reason": "x",
            "client_reference": "r1",
        },
    )
    assert res.status_code == 422 and res.json()["code"] == "idempotency_key_mismatch"


def test_openapi_documents_agent_routes_with_bearer_auth(client: TestClient) -> None:
    spec = client.get("/api/openapi.json").json()
    assert "/api/agent/v1/quotes" in spec["paths"]
    assert spec["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == "bearer"
    assert {"HTTPBearer": []} in spec["paths"]["/api/agent/v1/orders"]["post"]["security"]
    assert not any(p.startswith(("/api/conversations", "/api/voice")) for p in spec["paths"])
