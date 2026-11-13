from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import DELIVERY, FakeValio


def _draft(client: TestClient, lines: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    res = client.post(
        "/api/orders",
        json={
            "delivery_date": DELIVERY.isoformat(),
            "lines": lines,
            "request_text": "I need lactose-free milk by Monday",
            "candidates": [{"product_id": "462775", "note": "cheapest per litre"}, {"product_id": "464119"}],
            "reason": "Cheapest lactose-free 1 l milk available on the date",
            "preferences": ["LACTOSE_FREE"],
            **extra,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_under_threshold_order_is_placed_autonomously(client: TestClient) -> None:
    order = _draft(client, [{"product_id": "462775", "quantity": 100}])
    assert order["status"] == "draft"
    assert order["total"] == 257.0

    assert client.post(f"/api/orders/{order['id']}/agree").json()["status"] == "agreed"
    placed = client.post(f"/api/orders/{order['id']}/place").json()
    assert placed["status"] == "placed"


def test_over_threshold_order_escalates_then_approver_decides(client: TestClient) -> None:
    order = _draft(client, [{"product_id": "462775", "quantity": 400}])
    client.post(f"/api/orders/{order['id']}/agree")

    pending = client.post(f"/api/orders/{order['id']}/place").json()
    assert pending["status"] == "pending_approval"
    assert "spend limit" in pending["approval_reasons"][0]

    approved = client.post(f"/api/orders/{order['id']}/approve", json={"reason": "ok for the gala"}).json()
    assert approved["status"] == "approved"
    assert client.post(f"/api/orders/{order['id']}/reject", json={}).status_code == 409


def test_substitute_outside_preferences_escalates(client: TestClient) -> None:
    order = _draft(client, [{"product_id": "460025", "quantity": 10, "substitute_for": "460150"}])
    client.post(f"/api/orders/{order['id']}/agree")
    assert client.post(f"/api/orders/{order['id']}/place").json()["status"] == "pending_approval"


def test_price_drift_on_place_is_refused_and_needs_reconfirmation(client: TestClient, fake_valio: FakeValio) -> None:
    order = _draft(client, [{"product_id": "462775", "quantity": 10}])
    client.post(f"/api/orders/{order['id']}/agree")
    fake_valio.prices["462775"] = 2.99

    res = client.post(f"/api/orders/{order['id']}/place")
    assert res.status_code == 409
    body = res.json()
    assert body["code"] == "quote_changed"
    assert body["details"]["changes"][0] == {
        "product_id": "462775",
        "problem": "price_changed",
        "was": 2.57,
        "now": 2.99,
    }
    assert client.get(f"/api/orders/{order['id']}").json()["status"] == "draft"


def test_undeliverable_lines_are_rejected_at_draft(client: TestClient, fake_valio: FakeValio) -> None:
    fake_valio.stock["462775"] = 20
    res = client.post(
        "/api/orders",
        json={"delivery_date": DELIVERY.isoformat(), "lines": [{"product_id": "462775", "quantity": 50}]},
    )
    assert res.status_code == 409
    assert res.json()["details"]["lines"][0]["available_amount"] == 20


def test_quantity_must_respect_lot_size_and_known_products(client: TestClient) -> None:
    bad_lot = client.post(
        "/api/orders",
        json={"delivery_date": DELIVERY.isoformat(), "lines": [{"product_id": "462775", "quantity": 1.005}]},
    )
    assert bad_lot.status_code == 422
    unknown = client.post(
        "/api/orders",
        json={"delivery_date": DELIVERY.isoformat(), "lines": [{"product_id": "nope", "quantity": 1}]},
    )
    assert unknown.json()["code"] == "unknown_product"


def test_place_requires_agreement(client: TestClient) -> None:
    order = _draft(client, [{"product_id": "462775", "quantity": 1}])
    res = client.post(f"/api/orders/{order['id']}/place")
    assert res.status_code == 409
    assert res.json()["code"] == "invalid_state"


def test_idempotency_key_replays_the_first_response(client: TestClient, fake_valio: FakeValio) -> None:
    order = _draft(client, [{"product_id": "462775", "quantity": 1}])
    client.post(f"/api/orders/{order['id']}/agree")
    headers = {"Idempotency-Key": "retry-123"}
    first = client.post(f"/api/orders/{order['id']}/place", headers=headers).json()
    calls = len(fake_valio.calls)
    second = client.post(f"/api/orders/{order['id']}/place", headers=headers).json()
    assert first == second
    assert len(fake_valio.calls) == calls


def test_audit_trail_records_request_options_choice_and_reason(client: TestClient) -> None:
    order = _draft(client, [{"product_id": "462775", "quantity": 400}])
    client.post(f"/api/orders/{order['id']}/agree")
    client.post(f"/api/orders/{order['id']}/place")

    entries = client.get(f"/api/orders/{order['id']}/audit").json()
    assert [e["action"] for e in entries] == ["draft_created", "buyer_agreed", "escalated"]
    assert entries[0]["details"]["request"] == "I need lactose-free milk by Monday"
    assert [c["product_id"] for c in entries[0]["details"]["candidates_considered"]] == ["462775", "464119"]

    text = client.get(f"/api/orders/{order['id']}/audit.txt").text
    for expected in ("request: I need lactose-free milk", "options considered: 462775", "reason: Cheapest", "spend"):
        assert expected in text


def test_unknown_order_is_404(client: TestClient) -> None:
    assert client.get("/api/orders/ord_missing").status_code == 404
