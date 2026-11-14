import asyncio
import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest

from api.agents.models import AgentPrincipal, Mandate
from api.catalog.index import Catalog
from api.orders.models import OrderStatus
from api.orders.policy import ApprovalPolicy
from api.orders.service import OrderError, OrderService
from api.orders.store import ReferenceTakenError, Store
from api.procurement.schemas import (
    Amount,
    PlaceOrderLine,
    PlaceOrderRequest,
    QuoteItem,
    QuoteRequest,
    QuoteView,
)
from api.procurement.service import ProcurementService
from api.valio.client import ValioClient, ValioError
from tests.conftest import DELIVERY, FakeValio

REQUEST = "I need 1,000 litres of lactose-free milk by Monday."


def make_principal(name: str, customer: str, mandate: Mandate | None = None) -> AgentPrincipal:
    return AgentPrincipal(agent_id=f"agt_{name}", name=name, customer=customer, mandate=mandate or Mandate())


@dataclass
class Env:
    svc: ProcurementService
    orders: OrderService
    store: Store
    fake: FakeValio
    clock: list[datetime]
    agent: AgentPrincipal

    def other_agent(self, **mandate: Any) -> AgentPrincipal:
        return make_principal("other", "cust-2", Mandate(**mandate))

    def colleague(self, customer: str = "hotel-1", name: str = "ops") -> AgentPrincipal:
        return make_principal(name, customer)

    async def quote(
        self,
        items: list[QuoteItem],
        requirements: list[str] | None = None,
        agent: AgentPrincipal | None = None,
    ) -> QuoteView:
        req = QuoteRequest(items=items, delivery_date=DELIVERY, requirements=requirements or [], request_text=REQUEST)
        return await self.svc.quote(agent or self.agent, req)

    async def place(
        self,
        quote: QuoteView,
        lines: list[tuple[str, float]],
        ref: str = "ref-1",
        agent: AgentPrincipal | None = None,
    ) -> Any:
        req = PlaceOrderRequest(
            quote_id=quote.quote_id,
            lines=[PlaceOrderLine(product_id=p, quantity=q) for p, q in lines],
            reason="Cheapest option that covers the date",
            client_reference=ref,
        )
        return await self.svc.place_order(agent or self.agent, req)


def run(
    tmp_path: Path,
    catalog: Catalog,
    fake: FakeValio,
    body: Callable[[Env], Awaitable[None]],
    *,
    mandate: Mandate | None = None,
    quotes_per_minute: int = 30,
) -> None:
    async def main() -> None:
        store = Store(tmp_path / "p.sqlite3")
        http = httpx.AsyncClient(base_url="http://valio.test", transport=httpx.MockTransport(fake.handler))
        clock = [datetime.now(UTC)]
        agent = make_principal("hotel-agent", "hotel-1", mandate)
        orders = OrderService(store)
        svc = ProcurementService(
            store,
            catalog,
            ValioClient(http, api_key="test-key", cache_ttl_s=300),
            ApprovalPolicy(500.0),
            orders=orders,
            quote_ttl_s=900,
            quotes_per_minute=quotes_per_minute,
            now=lambda: clock[0],
        )
        try:
            await body(Env(svc, orders, store, fake, clock, agent))
        finally:
            await http.aclose()
            store.close()

    asyncio.run(main())


def items(*pairs: tuple[str, float]) -> list[QuoteItem]:
    return [QuoteItem(product_id=p, quantity=q) for p, q in pairs]


async def refused(code: str, call: Awaitable[Any]) -> OrderError:
    with pytest.raises(OrderError) as e:
        await call
    assert e.value.code == code, e.value.body()
    return e.value


def test_reference_request_converts_ranks_and_flags_cheapest(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        litres = Amount(value=1000, unit="L")
        q = await env.quote(
            [QuoteItem(product_id=p, amount=litres) for p in ("462775", "464119", "464073")],
            requirements=["LACTOSE_FREE"],
        )
        by_id = {o.product_id: o for o in q.options}
        assert by_id["464119"].quantity == 100
        assert by_id["464119"].conversion is not None and "10 L per KI" in by_id["464119"].conversion
        assert by_id["462775"].quantity == 1000
        assert [o.product_id for o in q.options] == ["464119", "464073", "462775"]
        assert q.options[0].cheapest_covering_option and q.options[0].line_total == 1540.0
        assert all(o.covers_request and o.meets_requirements for o in q.options)
        assert q.expires_at - q.created_at == timedelta(seconds=900)
        assert env.svc.get_quote(env.agent, q.quote_id).options == q.options

    run(tmp_path, catalog, fake_valio, body)


def test_place_within_limit(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(items(("462775", 100)))
        order = await env.place(q, [("462775", 100)])
        assert order.status == OrderStatus.PLACED
        assert order.total == 257.0 and order.approval_reasons == []
        assert order.agent_id == env.agent.agent_id and order.quote_id == q.quote_id

    run(tmp_path, catalog, fake_valio, body)


def test_above_limit_escalates_and_agent_reads_the_decision(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(items(("464119", 100)))
        order = await env.place(q, [("464119", 100)])
        assert order.status == OrderStatus.PENDING_APPROVAL
        assert order.approval_reasons == ["Total 1540.00 EUR exceeds the 500.00 EUR per-order spend limit"]
        ops = env.colleague()
        await env.svc.decide(ops, order.order_id, approve=True, reason="gala dinner")
        seen = env.svc.get_order(env.agent, order.order_id)
        assert seen.status == OrderStatus.APPROVED
        assert seen.decision is not None and seen.decision.reason == "gala dinner"
        assert seen.decision.decided_by is not None and seen.decision.decided_by.agent_id == ops.agent_id

    run(tmp_path, catalog, fake_valio, body)


def test_spend_limit_applies_to_each_order_on_its_own(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(env: Env) -> None:
        assert env.svc.whoami(env.agent).spend_limit_eur == 500
        for ref in ("ref-1", "ref-2"):  # 257 EUR each, 514 EUR together: neither order is over the limit
            q = await env.quote(items(("462775", 100)))
            order = await env.place(q, [("462775", 100)], ref=ref)
            assert order.status == OrderStatus.PLACED and order.approval_reasons == []

    run(tmp_path, catalog, fake_valio, body)


def test_line_missing_a_buyer_requirement_is_placed_and_recorded(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(items(("462775", 10), ("464073", 10)), requirements=["brand:Valio", "SPARKLY"])
        assert q.requirements == ["brand:Valio"] and q.ignored_requirements == ["SPARKLY"]
        arla = next(o for o in q.options if o.product_id == "462775")
        assert not arla.meets_requirements and arla.missing_requirements == ["brand:Valio"]
        assert not arla.breaks_mandate
        assert q.options[0].product_id == "464073"

        order = await env.place(q, [("462775", 10)])
        assert order.status == OrderStatus.PLACED and order.approval_reasons == []
        line = order.lines[0]
        assert not line.within_preferences and line.missing_requirements == ["brand:Valio"]
        audit = env.svc.audit(env.agent, order.order_id)
        assert audit.entries[0].summary.endswith("buyer accepted missing brand:Valio on 462775")
        assert "buyer accepted missing brand:Valio on 462775" in audit.text

    run(tmp_path, catalog, fake_valio, body)


def test_over_limit_with_a_missed_buyer_requirement_escalates_for_spend_only(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(items(("462775", 300)), requirements=["brand:Valio"])
        order = await env.place(q, [("462775", 300)])
        assert order.status == OrderStatus.PENDING_APPROVAL
        assert order.approval_reasons == ["Total 771.00 EUR exceeds the 500.00 EUR per-order spend limit"]
        assert order.lines[0].missing_requirements == ["brand:Valio"]

    run(tmp_path, catalog, fake_valio, body)


def test_mandate_tags_apply_even_when_the_agent_omits_them(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(items(("462775", 10)))
        assert q.requirements == ["no:AM"] and q.options[0].breaks_mandate
        calls = len(env.fake.calls)
        e = await refused("mandate_violation", env.place(q, [("462775", 10)]))
        assert e.status == 422
        assert e.details == {"lines": [{"product_id": "462775", "violations": ["no:AM"]}]}
        assert len(env.fake.calls) == calls
        assert env.svc.list_orders(env.agent).orders == []
        assert env.svc.get_quote(env.agent, q.quote_id).order_id is None

    run(tmp_path, catalog, fake_valio, body, mandate=Mandate(banned_allergens=["AM"]))


def test_mandate_tightened_after_the_quote_is_enforced_at_placement(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(items(("462775", 10)))
        assert not q.options[0].breaks_mandate
        stricter = env.agent.model_copy(update={"mandate": Mandate(required_tags=["brand:Valio"])})
        await refused("mandate_violation", env.place(q, [("462775", 10)], agent=stricter))

    run(tmp_path, catalog, fake_valio, body)


def test_price_moved_refuses_without_creating_an_order(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(items(("462775", 10)))
        env.fake.prices["462775"] = 2.99
        e = await refused("quote_changed", env.place(q, [("462775", 10)]))
        assert e.details["changes"][0] == {"product_id": "462775", "problem": "price_changed", "was": 2.57, "now": 2.99}
        assert env.svc.list_orders(env.agent).orders == []
        assert env.svc.get_quote(env.agent, q.quote_id).order_id is None

    run(tmp_path, catalog, fake_valio, body)


def test_stock_drop_after_quote_refuses(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(items(("462775", 50)))
        env.fake.stock["462775"] = 20
        e = await refused("quote_changed", env.place(q, [("462775", 50)]))
        assert e.details["changes"][0]["problem"] == "not_available_in_time"

    run(tmp_path, catalog, fake_valio, body)


def test_expired_foreign_unknown_and_reused_quotes_are_refused(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(items(("462775", 10)))
        e = await refused("quote_not_found", env.place(q, [("462775", 10)], agent=env.other_agent()))
        assert e.status == 404

        await env.place(q, [("462775", 10)], ref="first")
        await refused("quote_already_used", env.place(q, [("462775", 10)], ref="second"))

        stale = await env.quote(items(("462775", 10)))
        env.clock[0] += timedelta(seconds=901)
        await refused("quote_expired", env.place(stale, [("462775", 10)], ref="third"))

    run(tmp_path, catalog, fake_valio, body)


def test_lines_must_be_quoted_deliverable_and_on_lot_size(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        env.fake.stock["464073"] = 20
        q = await env.quote(items(("462775", 10), ("464073", 50)))
        await refused("line_not_in_quote", env.place(q, [("464119", 1)]))
        await refused("invalid_quantity", env.place(q, [("462775", 1.005)]))
        await refused("not_deliverable", env.place(q, [("464073", 50)]))
        await refused("duplicate_product", env.place(q, [("462775", 1), ("462775", 2)]))

    run(tmp_path, catalog, fake_valio, body)


def test_client_reference_makes_place_idempotent(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(items(("462775", 10)))
        first = await env.place(q, [("462775", 10)])
        calls = len(env.fake.calls)
        again = await env.place(q, [("462775", 10)])
        assert again == first and len(env.fake.calls) == calls

        other = await env.quote(items(("464073", 10)))
        await refused("client_reference_reused", env.place(other, [("464073", 10)]))

    run(tmp_path, catalog, fake_valio, body)


def test_orders_are_scoped_to_their_agent(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(items(("462775", 10)))
        order = await env.place(q, [("462775", 10)])
        intruder = env.other_agent()
        with pytest.raises(OrderError) as e:
            env.svc.get_order(intruder, order.order_id)
        assert e.value.status == 404
        with pytest.raises(OrderError):
            env.svc.audit(intruder, order.order_id)
        assert env.svc.list_orders(intruder).orders == []
        assert [o.order_id for o in env.svc.list_orders(env.agent, OrderStatus.PLACED).orders] == [order.order_id]

    run(tmp_path, catalog, fake_valio, body)


def test_audit_records_agent_request_options_choice_and_reason(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(items(("462775", 300), ("464073", 300)), requirements=["LACTOSE_FREE"])
        order = await env.place(q, [("464073", 300)])
        ops = env.colleague()
        await env.svc.decide(ops, order.order_id, approve=False, reason="too much")

        audit = env.svc.audit(env.agent, order.order_id)
        first = audit.entries[0]
        assert first.agent_id == env.agent.agent_id and first.action == "escalated"
        assert first.details["request"] == REQUEST
        assert [o["product_id"] for o in first.details["options_considered"]] == ["464073", "462775"]
        assert first.details["choice"][0]["product_id"] == "464073"
        assert [e.action for e in audit.entries] == ["escalated", "rejected"]
        for expected in (
            "Agent hotel-agent",
            "request: I need 1,000 litres",
            "options considered",
            "462775 Arla",
            "choice: 300 ST 464073",
            "reason: Cheapest",
            "spend limit",
            f"approver · rejected: Rejected by ops ({ops.agent_id}): too much",
        ):
            assert expected in audit.text, expected

    run(tmp_path, catalog, fake_valio, body)


def test_quote_guards(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(env: Env) -> None:
        past = QuoteRequest(items=items(("462775", 1)), delivery_date=DELIVERY - timedelta(days=30))
        await refused("invalid_date", env.svc.quote(env.agent, past))
        await refused("unknown_product", env.quote(items(("nope", 1))))
        await refused("duplicate_product", env.quote(items(("462775", 1), ("462775", 2))))
        q = await env.quote(items(("462775", 1), ("nope", 1)))
        assert q.unknown_products == ["nope"]
        await refused("rate_limited", env.quote(items(("462775", 1))))

    run(tmp_path, catalog, fake_valio, body, quotes_per_minute=1)


def test_upstream_is_queried_with_the_agents_customer(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    seen: list[str] = []
    original = fake_valio.handler

    def spy(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content)["customer"])
        return original(request)

    fake_valio.handler = spy  # type: ignore[method-assign]

    async def body(env: Env) -> None:
        await env.quote(items(("462775", 1)))

    run(tmp_path, catalog, fake_valio, body)
    assert seen == ["hotel-1", "hotel-1"]


def test_unknown_mandate_tag_is_enforced_as_unmet(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(items(("464073", 10)), requirements=["SPARKLY"])
        assert q.requirements == ["LACTOSE-FREE"] and q.ignored_requirements == ["SPARKLY"]
        e = await refused("mandate_violation", env.place(q, [("464073", 10)]))
        assert e.details["lines"][0]["violations"] == ["LACTOSE-FREE"]

    run(tmp_path, catalog, fake_valio, body, mandate=Mandate(required_tags=["LACTOSE-FREE"]))


def test_quoted_quantities_round_to_the_order_step_and_rank_failures_last(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        q = await env.quote(
            [
                QuoteItem(product_id="462775", amount=Amount(value=5, unit="kg")),
                QuoteItem(product_id="464119", quantity=2.5),
            ]
        )
        cases, carton = q.options
        assert cases.product_id == "464119" and cases.quantity == 3
        assert cases.conversion == "2.5 KI -> 3 KI (rounded up to a multiple of 1)"
        assert carton.conversion_error is not None and carton.quantity is None
        await refused("invalid_quantity", env.place(q, [("464119", 2.5)]))

    run(tmp_path, catalog, fake_valio, body)


def test_quote_expiring_during_the_requote_is_refused(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    clock: list[list[datetime]] = []
    original = fake_valio.handler

    def slow(request: httpx.Request) -> httpx.Response:
        if clock:
            clock[0][0] += timedelta(seconds=600)
        return original(request)

    fake_valio.handler = slow  # type: ignore[method-assign]

    async def body(env: Env) -> None:
        q = await env.quote(items(("462775", 10)))
        clock.append(env.clock)
        await refused("quote_expired", env.place(q, [("462775", 10)]))
        assert env.svc.list_orders(env.agent).orders == []

    run(tmp_path, catalog, fake_valio, body)


def test_concurrent_reference_reuse_rolls_back_and_keeps_the_quote(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        first = await env.place(await env.quote(items(("462775", 10))), [("462775", 10)])
        q = await env.quote(items(("464073", 10)))
        order = env.store.get_order(first.order_id)
        assert order is not None
        clone = order.model_copy(update={"id": "ord_clone", "quote_id": q.quote_id})
        with pytest.raises(ReferenceTakenError):
            env.store.place_from_quote(clone, [], q.quote_id, "ref-1")
        assert env.store.get_order("ord_clone") is None
        assert env.svc.get_quote(env.agent, q.quote_id).order_id is None

    run(tmp_path, catalog, fake_valio, body)


async def escalated(env: Env, ref: str = "big", agent: AgentPrincipal | None = None) -> Any:
    order = await env.place(await env.quote(items(("464119", 100)), agent=agent), [("464119", 100)], ref, agent)
    assert order.status == OrderStatus.PENDING_APPROVAL
    return order


def test_any_key_of_the_customer_sees_and_decides_its_orders(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        first = await escalated(env, "first")
        env.clock[0] += timedelta(seconds=1)
        second = await escalated(env, "second")
        await escalated(env, "foreign", agent=env.other_agent())
        small = await env.place(await env.quote(items(("462775", 10))), [("462775", 10)], "small")

        ops = env.colleague()
        queue = env.svc.list_pending_approvals(ops)
        assert [o.order_id for o in queue.orders] == [first.order_id, second.order_id]
        company = env.svc.list_orders(ops, scope="company")
        assert {o.order_id for o in company.orders} == {first.order_id, second.order_id, small.order_id}
        assert env.svc.list_orders(ops).orders == []
        assert env.svc.get_order(ops, first.order_id).agent_id == env.agent.agent_id
        assert env.svc.audit(ops, first.order_id).entries[0].action == "escalated"

        rejected = await env.svc.decide(ops, second.order_id, approve=False, reason="  over budget  ")
        assert rejected.status == OrderStatus.REJECTED
        assert rejected.decision is not None and rejected.decision.reason == "over budget"
        entry = env.svc.audit(env.agent, second.order_id).entries[-1]
        assert entry.actor == "approver" and entry.agent_id == ops.agent_id
        assert entry.details["decided_by"] == {"agent_id": ops.agent_id, "name": "ops"}

        approved = await env.svc.decide(ops, first.order_id, approve=True, reason="gala")
        again = await env.svc.decide(ops, first.order_id, approve=True, reason="gala")
        assert again == approved and len(env.svc.audit(ops, first.order_id).entries) == 2
        assert [o.order_id for o in env.svc.list_pending_approvals(ops).orders] == []

        await refused("invalid_state", env.svc.decide(ops, small.order_id, approve=True, reason="x"))

    run(tmp_path, catalog, fake_valio, body)


def test_the_buyer_decides_their_own_agents_escalation(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(env: Env) -> None:
        order = await escalated(env)
        decided = await env.svc.decide(env.agent, order.order_id, approve=True, reason="buyer approved")
        assert decided.status == OrderStatus.APPROVED
        assert decided.decision is not None and decided.decision.decided_by is not None
        assert decided.decision.decided_by.agent_id == env.agent.agent_id

    run(tmp_path, catalog, fake_valio, body)


def test_foreign_keys_cannot_see_or_decide_and_a_reason_is_required_to_reject(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        rival = env.colleague(customer="cust-2", name="rival")
        order = await escalated(env)

        e = await refused("order_not_found", env.svc.decide(rival, order.order_id, approve=True, reason="x"))
        assert e.status == 404
        with pytest.raises(OrderError):
            env.svc.audit(rival, order.order_id)
        assert env.svc.list_pending_approvals(rival).orders == []
        await refused("reason_required", env.svc.decide(env.agent, order.order_id, approve=False, reason="   "))
        assert env.svc.get_order(env.agent, order.order_id).status == OrderStatus.PENDING_APPROVAL
        approved = await env.svc.decide(env.agent, order.order_id, approve=True, reason="")
        assert approved.status == OrderStatus.APPROVED and approved.decision is not None
        assert approved.decision.reason == ""

    run(tmp_path, catalog, fake_valio, body)


def test_orders_stored_without_decided_by_still_load(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(env: Env) -> None:
        order = await escalated(env)
        stored = env.store.get_order(order.order_id)
        assert stored is not None
        data = stored.model_dump(mode="json")
        data["status"] = "approved"
        data["decision"] = {"approved": True, "reason": "legacy", "at": data["updated_at"]}
        with env.store.transaction() as c:
            c.execute("UPDATE orders SET data = ? WHERE id = ?", (json.dumps(data), order.order_id))
        seen = env.svc.get_order(env.agent, order.order_id)
        assert seen.decision is not None and seen.decision.decided_by is None

    run(tmp_path, catalog, fake_valio, body)


def test_approval_with_unchanged_price_and_stock_requotes_once(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        order = await escalated(env)
        calls = len(env.fake.calls)
        approved = await env.svc.decide(env.agent, order.order_id, approve=True, reason="gala")
        assert approved.status == OrderStatus.APPROVED and approved.total == order.total
        assert len(env.fake.calls) == calls + 2  # one price and one availability call
        entry = env.svc.audit(env.agent, order.order_id).entries[-1]
        assert entry.action == "approved" and entry.details["confirmed_via"] == "rest"

    run(tmp_path, catalog, fake_valio, body)


def test_price_change_at_approval_needs_the_new_total_confirmed(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        order = await escalated(env)
        env.fake.prices["464119"] = 16.0
        e = await refused("price_changed", env.svc.decide(env.agent, order.order_id, approve=True, reason="gala"))
        assert e.status == 409
        assert e.details == {
            "changes": [{"product_id": "464119", "problem": "price_changed", "was": 15.4, "now": 16.0}],
            "old_total": 1540.0,
            "new_total": 1600.0,
        }
        assert env.svc.get_order(env.agent, order.order_id).status == OrderStatus.PENDING_APPROVAL

        stale = env.svc.decide(env.agent, order.order_id, approve=True, reason="gala", expected_total=1540.0)
        await refused("price_changed", stale)

        approved = await env.svc.decide(env.agent, order.order_id, approve=True, reason="gala", expected_total=1600)
        assert approved.status == OrderStatus.APPROVED and approved.total == 1600.0
        assert approved.lines[0].unit_price == 16.0 and approved.lines[0].line_total == 1600.0
        audit = env.svc.audit(env.agent, order.order_id)
        assert [x.action for x in audit.entries] == ["escalated", "repriced", "approved"]
        assert audit.entries[1].details["old_total"] == 1540.0 and audit.entries[1].details["new_total"] == 1600.0
        assert "total 1540.00 -> 1600.00 EUR (464119 15.40 -> 16.00)" in audit.text

    run(tmp_path, catalog, fake_valio, body)


def test_unchanged_price_with_a_stale_expected_total_is_refused(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        order = await escalated(env)
        call = env.svc.decide(env.agent, order.order_id, approve=True, reason="gala", expected_total=999)
        e = await refused("price_changed", call)
        assert e.details["changes"] == [] and e.details["new_total"] == 1540.0
        ok = await env.svc.decide(env.agent, order.order_id, approve=True, reason="gala", expected_total=1540.004)
        assert ok.status == OrderStatus.APPROVED

    run(tmp_path, catalog, fake_valio, body)


def test_stock_short_at_approval_closes_the_order_for_a_rerun(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        q = await env.svc.quote(
            env.agent,
            QuoteRequest(
                items=items(("464119", 100)),
                delivery_date=DELIVERY,
                requirements=["LACTOSE_FREE"],
                request_text=REQUEST,
                purpose="coffee",
            ),
        )
        order = await env.place(q, [("464119", 100)])
        env.fake.stock["464119"] = 20
        env.fake.prices["464119"] = 16.0  # a price move as well: stock wins
        ops = env.colleague()
        e = await refused("stock_changed", env.svc.decide(ops, order.order_id, approve=True, reason="gala"))
        assert e.status == 409
        assert {c["problem"] for c in e.details["changes"]} == {"price_changed", "not_available_in_time"}
        assert e.details["rerun"] == {
            "request_text": REQUEST,
            "requirements": ["LACTOSE_FREE"],
            "purpose": "coffee",
            "delivery_date": DELIVERY.isoformat(),
            "lines": [{"product_id": "464119", "quantity": 100, "substitute_for": None}],
        }
        closed = env.svc.get_order(env.agent, order.order_id)
        assert closed.status == OrderStatus.REJECTED and e.details["order"]["status"] == "rejected"
        assert closed.decision is not None and closed.decision.decided_by is None
        assert "464119" in closed.decision.reason
        last = env.svc.audit(env.agent, order.order_id).entries[-1]
        assert last.actor == "system" and last.action == "rejected" and last.agent_id is None
        await refused("invalid_state", env.svc.decide(ops, order.order_id, approve=True, reason="again"))

    run(tmp_path, catalog, fake_valio, body)


def test_rejecting_never_calls_upstream(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(env: Env) -> None:
        order = await escalated(env)
        env.fake.stock["464119"] = 1
        calls = len(env.fake.calls)
        rejected = await env.svc.decide(env.agent, order.order_id, approve=False, reason="no")
        assert rejected.status == OrderStatus.REJECTED and len(env.fake.calls) == calls
        assert rejected.decision is not None and rejected.decision.decided_by is not None

    run(tmp_path, catalog, fake_valio, body)


def test_upstream_failure_at_approval_leaves_the_order_pending(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        order = await escalated(env)
        env.fake.status = 503
        with pytest.raises(ValioError):
            await env.svc.decide(env.agent, order.order_id, approve=True, reason="gala")
        assert env.svc.get_order(env.agent, order.order_id).status == OrderStatus.PENDING_APPROVAL

    run(tmp_path, catalog, fake_valio, body)


def test_a_decision_landing_during_the_recheck_wins(tmp_path: Path, catalog: Catalog, fake_valio: FakeValio) -> None:
    race: list[tuple[Store, str]] = []
    original = fake_valio.handler

    def racing(request: httpx.Request) -> httpx.Response:
        # Another process rejects the order while this approval waits on upstream.
        if race:
            store, order_id = race.pop()
            stored = store.get_order(order_id)
            assert stored is not None
            store.save_order(stored.model_copy(update={"status": OrderStatus.REJECTED}), [])
        return original(request)

    fake_valio.handler = racing  # type: ignore[method-assign]

    async def body(env: Env) -> None:
        order = await escalated(env)
        race.append((env.store, order.order_id))
        await refused("invalid_state", env.svc.decide(env.agent, order.order_id, approve=True, reason="late"))
        assert not race and env.svc.get_order(env.agent, order.order_id).status == OrderStatus.REJECTED

    run(tmp_path, catalog, fake_valio, body)


def test_purpose_is_frozen_on_the_quote_and_carried_to_the_order_and_audit(
    tmp_path: Path, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(env: Env) -> None:
        req = QuoteRequest(
            items=items(("464073", 10)), delivery_date=DELIVERY, request_text=REQUEST, purpose=" coffee "
        )
        q = await env.svc.quote(env.agent, req)
        assert q.purpose == "coffee" and env.svc.get_quote(env.agent, q.quote_id).purpose == "coffee"
        order = await env.place(q, [("464073", 10)])
        assert order.purpose == "coffee"
        audit = env.svc.audit(env.agent, order.order_id)
        assert audit.entries[0].details["purpose"] == "coffee"
        assert "request: I need 1,000 litres of lactose-free milk by Monday.\n    purpose: coffee" in audit.text

        blank = QuoteRequest(items=items(("464073", 1)), delivery_date=DELIVERY, purpose="   ")
        assert blank.purpose is None

        stored = env.store.get_order(order.order_id)
        assert stored is not None
        data = stored.model_dump(mode="json")
        del data["purpose"]
        with env.store.transaction() as c:
            c.execute("UPDATE orders SET data = ? WHERE id = ?", (json.dumps(data), order.order_id))
        assert env.svc.get_order(env.agent, order.order_id).purpose is None

    run(tmp_path, catalog, fake_valio, body)
