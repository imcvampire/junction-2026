import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from api.agent import tools
from api.agent.state import Session
from api.catalog.index import Catalog
from api.orders.policy import ApprovalPolicy
from api.orders.service import OrderService
from api.orders.store import Store
from api.valio.client import ValioClient
from tests.conftest import DELIVERY, FakeValio


@pytest.fixture
def ctx_factory(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio):
    store = Store(tmp_path / "tools.sqlite3")
    http = httpx.AsyncClient(base_url="http://valio.test", transport=httpx.MockTransport(fake_valio.handler))
    valio = ValioClient(http, api_key="test-key", customer="c", cache_ttl_s=300)
    orders = OrderService(store, catalog, valio, ApprovalPolicy(500.0), "c")

    def make(session: Session) -> tools.ToolContext:
        return tools.ToolContext(session=session, catalog=catalog, valio=valio, orders=orders, ar_max_stack_m=1.6)

    yield make
    store.close()


def _run(ctx: tools.ToolContext, name: str, args: dict[str, Any]) -> dict[str, Any]:
    return asyncio.run(tools.execute(ctx, name, json.dumps(args)))


def _draft_args() -> dict[str, Any]:
    return {
        "delivery_date": DELIVERY.isoformat(),
        "lines": [{"product_id": "462921", "quantity": 20}],
        "preferences": ["LACTOSE_FREE"],
        "candidates_considered": [{"product_id": "462921"}, {"product_id": "462775"}],
        "reason": "5 l cases, available Monday",
    }


def test_search_returns_conversion_data_for_the_model(ctx_factory: Any) -> None:
    out = _run(
        ctx_factory(Session(id="s1", turn=1)), "search_products", {"query": "milk", "required_tags": ["LACTOSE_FREE"]}
    )
    by_id = {r["product_id"]: r for r in out["results"]}
    assert by_id["462921"]["content_per_sales_unit"] == "5 L"
    assert by_id["462921"]["sales_unit"] == "KI"


def test_quote_produces_offer_cards_and_moves_to_proposing(ctx_factory: Any) -> None:
    ctx = ctx_factory(Session(id="s1", turn=1))
    out = _run(
        ctx, "quote", {"items": [{"product_id": "462921", "quantity": 200}], "delivery_date": DELIVERY.isoformat()}
    )
    assert out["quotes"][0]["line_total"] == 2194.0
    assert ctx.effects.flow_state == "proposing"
    assert ctx.effects.offers[0].covers_request is True


def test_agree_is_refused_in_the_turn_the_draft_was_created(ctx_factory: Any) -> None:
    session = Session(id="s1", turn=1)
    ctx = ctx_factory(session)
    draft = _run(ctx, "create_order_draft", _draft_args())
    assert ctx.effects.flow_state == "confirming"

    refused = _run(ctx, "agree_order", {"order_id": draft["order_id"]})
    assert refused["error"] == "confirmation_required"

    session.turn = 2
    ctx2 = ctx_factory(session)
    agreed = _run(ctx2, "agree_order", {"order_id": draft["order_id"]})
    assert agreed["status"] == "agreed"
    assert ctx2.effects.flow_state == "ar_offered"
    assert [a.type for a in ctx2.effects.actions] == ["offer_ar"]
    assert "pallet" in agreed["space_needed"]


def test_place_applies_policy_server_side(ctx_factory: Any) -> None:
    session = Session(id="s1", turn=1)
    draft = _run(ctx_factory(session), "create_order_draft", _draft_args())
    session.turn = 2
    _run(ctx_factory(session), "agree_order", {"order_id": draft["order_id"]})
    assert _run(ctx_factory(session), "place_order", {"order_id": draft["order_id"]})["error"] == "too_early"
    session.turn = 3
    ctx = ctx_factory(session)
    placed = _run(ctx, "place_order", {"order_id": draft["order_id"]})
    assert placed["status"] == "placed"
    assert ctx.effects.flow_state == "placed"


def test_orders_from_other_sessions_are_invisible(ctx_factory: Any) -> None:
    draft = _run(ctx_factory(Session(id="s1", turn=1)), "create_order_draft", _draft_args())
    out = _run(ctx_factory(Session(id="intruder", turn=5)), "place_order", {"order_id": draft["order_id"]})
    assert out["error"] == "order_not_found"


def test_bad_model_arguments_are_rejected_before_any_side_effect(ctx_factory: Any, fake_valio: FakeValio) -> None:
    ctx = ctx_factory(Session(id="s1", turn=1))
    assert _run(ctx, "quote", {"items": [], "delivery_date": "monday"})["error"] == "invalid_arguments"
    assert asyncio.run(tools.execute(ctx, "quote", "{not json"))["error"] == "invalid_arguments"
    assert _run(ctx, "drop_tables", {})["error"] == "unknown_tool"
    assert fake_valio.calls == []


def test_upstream_failure_is_reported_to_the_model(ctx_factory: Any, fake_valio: FakeValio) -> None:
    fake_valio.status = 503
    out = _run(
        ctx_factory(Session(id="s1", turn=1)),
        "quote",
        {"items": [{"product_id": "462921"}], "delivery_date": DELIVERY.isoformat()},
    )
    assert out["error"] == "upstream_unavailable"


def test_tool_schemas_are_self_contained() -> None:
    for t in tools.TOOLS.values():
        assert "$ref" not in json.dumps(t.schema())


def test_searched_requirements_escalate_lines_the_model_did_not_flag(ctx_factory: Any) -> None:
    session = Session(id="s1", turn=1)
    _run(ctx_factory(session), "search_products", {"query": "milk", "required_tags": ["LACTOSE_FREE"]})
    args = _draft_args() | {"lines": [{"product_id": "460025", "quantity": 1}], "preferences": []}
    draft = _run(ctx_factory(session), "create_order_draft", args)
    assert "LACTOSE_FREE" in draft["needs_approval"][0]


def test_requirements_reset_for_a_new_request(ctx_factory: Any) -> None:
    session = Session(id="s1", turn=1, requirements=["LACTOSE_FREE"], flow_state="placed")
    _run(ctx_factory(session), "search_products", {"query": "courgette"})
    assert session.requirements == []


def test_quote_change_on_place_returns_to_confirming(ctx_factory: Any, fake_valio: FakeValio) -> None:
    session = Session(id="s1", turn=1)
    draft = _run(ctx_factory(session), "create_order_draft", _draft_args())
    session.turn = 2
    _run(ctx_factory(session), "agree_order", {"order_id": draft["order_id"]})
    fake_valio.prices["462921"] = 11.5
    session.turn = 3
    ctx = ctx_factory(session)
    out = _run(ctx, "place_order", {"order_id": draft["order_id"]})
    assert out["error"] == "quote_changed"
    assert ctx.effects.flow_state == "confirming"
    assert ctx.effects.order is not None and ctx.effects.order.total == 230.0
    assert (
        _run(ctx_factory(session), "agree_order", {"order_id": draft["order_id"]})["error"] == "confirmation_required"
    )


def test_unexpected_tool_crash_is_contained(ctx_factory: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(*_: Any) -> dict[str, Any]:
        raise RuntimeError("bug")

    monkeypatch.setitem(tools.TOOLS, "quote", tools.Tool("quote", "x", tools.QuoteArgs, boom))
    out = _run(
        ctx_factory(Session(id="s1", turn=1)),
        "quote",
        {"items": [{"product_id": "462921"}], "delivery_date": DELIVERY.isoformat()},
    )
    assert out["error"] == "internal_error"


def test_quote_ranks_by_total_and_marks_cheapest_covering_option(ctx_factory: Any) -> None:
    ctx = ctx_factory(Session(id="s1", turn=1))
    out = _run(
        ctx,
        "quote",
        {
            "items": [{"product_id": "462921", "quantity": 200}, {"product_id": "464119", "quantity": 100}],
            "delivery_date": DELIVERY.isoformat(),
        },
    )
    assert [q["product_id"] for q in out["quotes"]] == ["464119", "462921"]
    assert out["quotes"][0].get("cheapest_covering_option") is True
    assert "cheapest_covering_option" not in out["quotes"][1]
    assert [o.product_id for o in ctx.effects.offers] == ["464119", "462921"]


def test_free_text_preferences_are_ignored_not_escalated(ctx_factory: Any) -> None:
    session = Session(id="s1", turn=1)
    args = _draft_args() | {"preferences": ["LACTOSE_FREE", "1000 litres", "delivery by Monday"]}
    draft = _run(ctx_factory(session), "create_order_draft", args)
    assert draft["needs_approval"] == []
    assert draft["ignored_preferences"] == ["1000 litres", "delivery by Monday"]
