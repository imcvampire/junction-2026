from datetime import datetime
from typing import Any

import httpx
from fastapi.testclient import TestClient

from api.agents.models import SHARED_AGENT_ID, SHARED_AGENT_NAME
from api.catalog.index import Catalog
from api.config import Settings
from api.main import create_app
from tests.conftest import DELIVERY, FakeValio


def _quote(client: TestClient, quantity: float = 100, product_id: str = "462775") -> dict[str, Any]:
    res = client.post(
        "/api/agent/v1/quotes",
        json={
            "items": [{"product_id": product_id, "quantity": quantity}],
            "delivery_date": DELIVERY.isoformat(),
            "requirements": ["LACTOSE_FREE"],
            "request_text": "I need lactose-free milk by Monday",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _order(client: TestClient, quote: dict[str, Any], ref: str = "r1") -> Any:
    option = quote["options"][0]
    return client.post(
        "/api/agent/v1/orders",
        json={
            "quote_id": quote["quote_id"],
            "lines": [{"product_id": option["product_id"], "quantity": option["quantity"]}],
            "reason": "Cheapest lactose-free option",
            "client_reference": ref,
        },
    )


def _escalated(client: TestClient, ref: str = "big") -> dict[str, Any]:
    order = _order(client, _quote(client, quantity=400), ref).json()
    assert order["status"] == "pending_approval"
    return order


def test_me_reports_the_shared_agent_and_its_authority(client: TestClient) -> None:
    me = client.get("/api/agent/v1/me").json()
    assert (me["agent_id"], me["name"]) == (SHARED_AGENT_ID, SHARED_AGENT_NAME)
    assert me["spend_limit_eur"] == 500 and "spend_limit_source" not in me
    assert me["required_tags"] == [] and me["banned_allergens"] == []


def test_search_and_product_lookup(client: TestClient) -> None:
    hits = client.get("/api/agent/v1/products", params={"q": "milk", "tag": "LACTOSE_FREE"}).json()
    assert hits["count"] >= 3 and all("LACTOSE_FREE" in p["tags"] for p in hits["products"])
    product = client.get("/api/agent/v1/products/464119").json()
    assert product["content_per_sales_unit"] == "10 L" and product["allergens"] == {"AM": "milk"}
    assert client.get("/api/agent/v1/products/nope").status_code == 404


def test_quote_to_placed_order_with_audit(client: TestClient) -> None:
    quote = _quote(client)
    assert client.get(f"/api/agent/v1/quotes/{quote['quote_id']}").status_code == 200

    res = _order(client, quote)
    assert res.status_code == 201, res.text
    order = res.json()
    assert order["status"] == "placed" and order["total"] == 257.0

    listed = client.get("/api/agent/v1/orders", params={"status": "placed"}).json()
    assert [o["order_id"] for o in listed["orders"]] == [order["order_id"]]
    text = client.get(f"/api/agent/v1/orders/{order['order_id']}/audit.txt").text
    assert f"Agent {SHARED_AGENT_NAME}" in text and "options considered" in text


def test_escalation_is_decided_through_the_shared_agent(client: TestClient) -> None:
    order = _escalated(client)
    assert "per-order spend limit" in order["approval_reasons"][0]

    queue = client.get("/api/agent/v1/approvals").json()
    assert [o["order_id"] for o in queue["orders"]] == [order["order_id"]]
    company = client.get("/api/agent/v1/orders", params={"scope": "company"}).json()
    assert [o["order_id"] for o in company["orders"]] == [order["order_id"]]

    url = f"/api/agent/v1/orders/{order['order_id']}/approve"
    res = client.post(url, headers={"Idempotency-Key": "k1"}, json={"reason": "gala"})
    assert res.status_code == 200, res.text
    assert res.json()["decision"]["decided_by"] == {"agent_id": SHARED_AGENT_ID, "name": SHARED_AGENT_NAME}
    again = client.post(url, headers={"Idempotency-Key": "k1"}, json={"reason": "gala"})
    assert again.json() == res.json()
    reject = client.post(f"/api/agent/v1/orders/{order['order_id']}/reject", json={"reason": "late"})
    assert reject.status_code == 409 and reject.json()["code"] == "invalid_state"

    audit = client.get(f"/api/agent/v1/orders/{order['order_id']}/audit").json()
    assert [(e["actor"], e["agent_id"]) for e in audit["entries"]][-1] == ("approver", SHARED_AGENT_ID)
    assert len(audit["entries"]) == 2


def test_a_rejection_needs_a_reason_and_an_approval_does_not(client: TestClient) -> None:
    first, second = _escalated(client, "first"), _escalated(client, "second")
    url = f"/api/agent/v1/orders/{first['order_id']}"
    blank = client.post(f"{url}/reject", json={"reason": " "})
    assert blank.status_code == 422 and blank.json()["code"] == "reason_required"
    assert client.post(f"{url}/reject", json={}).json()["code"] == "reason_required"
    missing = client.post("/api/agent/v1/orders/ord_nope/approve", json={"reason": "x"})
    assert missing.status_code == 404 and missing.json()["code"] == "order_not_found"
    res = client.post(f"{url}/reject", json={"reason": "too much"})
    assert res.status_code == 200 and res.json()["status"] == "rejected"
    approved = client.post(f"/api/agent/v1/orders/{second['order_id']}/approve", json={})
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved" and approved.json()["decision"]["reason"] == ""


def test_console_routes_decide_without_a_key(client: TestClient) -> None:
    order = _escalated(client)
    url = f"/api/orders/{order['order_id']}"

    assert client.get(url).json()["status"] == "pending_approval"
    assert client.get("/api/orders/ord_nope").status_code == 404
    res = client.post(f"{url}/approve", headers={"Idempotency-Key": "c1"}, json={"reason": "ok"})
    assert res.status_code == 200 and res.json()["decision"]["decided_by"]["name"] == SHARED_AGENT_NAME
    again = client.post(f"{url}/approve", headers={"Idempotency-Key": "c1"}, json={"reason": "ok"})
    assert again.json() == res.json()
    assert client.post(f"{url}/reject", json={"reason": "no"}).status_code == 409
    assert [e["action"] for e in client.get(f"{url}/audit").json()] == ["escalated", "approved"]
    assert f"Approved by {SHARED_AGENT_NAME}" in client.get(f"{url}/audit.txt").text


def test_quote_changed_is_409_and_creates_nothing(client: TestClient, fake_valio: FakeValio) -> None:
    quote = _quote(client)
    fake_valio.prices["462775"] = 2.99
    res = _order(client, quote)
    assert res.status_code == 409 and res.json()["code"] == "quote_changed"
    assert client.get("/api/agent/v1/orders").json()["orders"] == []


def test_idempotency_key_must_match_client_reference(client: TestClient) -> None:
    quote = _quote(client)
    option = quote["options"][0]
    res = client.post(
        "/api/agent/v1/orders",
        headers={"Idempotency-Key": "other"},
        json={
            "quote_id": quote["quote_id"],
            "lines": [{"product_id": option["product_id"], "quantity": 1}],
            "reason": "x",
            "client_reference": "r1",
        },
    )
    assert res.status_code == 422 and res.json()["code"] == "idempotency_key_mismatch"


def test_openapi_documents_agent_routes_without_auth(client: TestClient) -> None:
    spec = client.get("/api/openapi.json").json()
    assert "/api/agent/v1/quotes" in spec["paths"]
    assert "securitySchemes" not in spec.get("components", {})
    assert "security" not in spec["paths"]["/api/agent/v1/orders"]["post"]
    assert not any(p.startswith(("/api/conversations", "/api/voice")) for p in spec["paths"])


def test_company_mandate_violation_is_422_and_creates_nothing(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    cfg = settings.model_copy(update={"banned_allergens": ["AM"]})
    app = create_app(cfg, catalog=catalog, valio_transport=httpx.MockTransport(fake_valio.handler))
    with TestClient(app) as c:
        assert c.get("/api/agent/v1/me").json()["banned_allergens"] == ["AM"]
        quote = _quote(c)
        assert quote["options"][0]["breaks_mandate"]
        res = _order(c, quote)
        assert res.status_code == 422 and res.json()["code"] == "mandate_violation"
        assert c.get("/api/agent/v1/orders").json()["orders"] == []


def test_price_change_at_approval_is_confirmed_with_expected_total(client: TestClient, fake_valio: FakeValio) -> None:
    # The second order is quoted at the first one's approved price, so the moves chain: 2.57 -> 3.00 -> 3.50.
    for base, ref, was, now in (("/api/agent/v1/orders", "agent", 1028, 3.0), ("/api/orders", "console", 1200, 3.5)):
        order = _escalated(client, ref)
        assert order["total"] == was
        fake_valio.prices["462775"] = now
        url = f"{base}/{order['order_id']}/approve"
        refused = client.post(url, json={"reason": "gala"})
        assert refused.status_code == 409 and refused.json()["code"] == "price_changed", refused.text
        assert refused.json()["details"]["new_total"] == now * 400
        stale = client.post(url, json={"reason": "gala", "expected_total": was})
        assert stale.status_code == 409
        res = client.post(url, json={"reason": "gala", "expected_total": now * 400})
        assert res.status_code == 200, res.text
        assert res.json()["status"] == "approved" and res.json()["total"] == now * 400


def test_stock_short_at_approval_is_409_and_closes_the_order(client: TestClient, fake_valio: FakeValio) -> None:
    order = _escalated(client)
    fake_valio.stock["462775"] = 10
    res = client.post(f"/api/agent/v1/orders/{order['order_id']}/approve", json={"reason": "gala"})
    assert res.status_code == 409 and res.json()["code"] == "stock_changed"
    assert res.json()["details"]["rerun"]["request_text"] == "I need lactose-free milk by Monday"
    seen = client.get(f"/api/agent/v1/orders/{order['order_id']}").json()
    assert seen["status"] == "rejected" and seen["decision"]["decided_by"] is None


def test_purpose_reaches_the_quote_and_order(client: TestClient) -> None:
    res = client.post(
        "/api/agent/v1/quotes",
        json={
            "items": [{"product_id": "462775", "quantity": 10}],
            "delivery_date": DELIVERY.isoformat(),
            "purpose": "coffee",
        },
    )
    assert res.status_code == 201 and res.json()["purpose"] == "coffee"
    order = _order(client, res.json()).json()
    assert order["purpose"] == "coffee"
    long = client.post(
        "/api/agent/v1/quotes",
        json={
            "items": [{"product_id": "462775", "quantity": 1}],
            "delivery_date": DELIVERY.isoformat(),
            "purpose": "x" * 201,
        },
    )
    assert long.status_code == 422


def test_agent_cancels_a_placed_order_until_it_ships(client: TestClient) -> None:
    first = _order(client, _quote(client), "c1").json()
    url = f"/api/agent/v1/orders/{first['order_id']}/cancel"
    blank = client.post(url, json={"reason": " "})
    assert blank.status_code == 422 and blank.json()["code"] == "reason_required"
    res = client.post(url, headers={"Idempotency-Key": "k1"}, json={"reason": "menu changed"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "cancelled" and res.json()["cancellation"]["confirmed_via"] == "rest"
    again = client.post(url, headers={"Idempotency-Key": "k1"}, json={"reason": "menu changed"})
    assert again.json() == res.json()
    listed = client.get("/api/agent/v1/orders", params={"status": "cancelled"}).json()
    assert [o["order_id"] for o in listed["orders"]] == [first["order_id"]]

    second = _order(client, _quote(client), "c2").json()
    shipped = client.post(f"/api/orders/{second['order_id']}/ship")
    assert shipped.status_code == 200 and shipped.json()["status"] == "shipped"
    late = client.post(f"/api/agent/v1/orders/{second['order_id']}/cancel", json={"reason": "too late"})
    assert late.status_code == 409 and late.json()["code"] == "already_shipped"
    shipped_at = datetime.fromisoformat(late.json()["details"]["shipped_at"])
    assert shipped_at == datetime.fromisoformat(shipped.json()["shipped_at"])


def test_console_ships_committed_orders_and_cancels_approved_ones(client: TestClient) -> None:
    pending = _escalated(client, "p1")
    url = f"/api/orders/{pending['order_id']}"
    early = client.post(f"{url}/ship")
    assert early.status_code == 409 and early.json()["code"] == "invalid_state"
    assert client.post(f"{url}/approve", json={"reason": "ok"}).status_code == 200

    res = client.post(f"{url}/cancel", json={"reason": "event moved"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "cancelled" and body["decision"]["approved"] is True
    assert body["cancellation"]["confirmed_via"] == "rest"
    assert [e["action"] for e in client.get(f"{url}/audit").json()] == ["escalated", "approved", "cancelled"]
    assert "Cancelled by" in client.get(f"{url}/audit.txt").text
    assert client.post(f"{url}/ship").json()["code"] == "invalid_state"
    assert client.post("/api/orders/ord_nope/ship").status_code == 404
