from datetime import date

import pytest

from api.orders.models import Order, OrderLine, OrderStatus, utcnow
from api.orders.policy import ApprovalPolicy


def _order(total: float, *, substitute: bool = False, within: bool = True) -> Order:
    now = utcnow()
    return Order(
        id="ord_x",
        session_id=None,
        status=OrderStatus.AGREED,
        customer="c",
        delivery_date=date(2026, 11, 16),
        currency="EUR",
        lines=[
            OrderLine(
                product_id="462775",
                name="Milk",
                quantity=1,
                sales_unit="ST",
                unit_price=total,
                line_total=total,
                available_amount=None,
                available_date=None,
                covers_request=True,
                substitute_for="464073" if substitute else None,
                within_preferences=within,
            )
        ],
        total=total,
        preferences=["LACTOSE_FREE"],
        quoted_at=now,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.parametrize(
    ("total", "substitute", "within", "needs_approval"),
    [
        (499.99, False, True, False),
        (500.00, False, True, False),
        (500.01, False, True, True),
        (100.00, True, True, False),
        (100.00, True, False, True),
        (100.00, False, False, True),
    ],
)
def test_policy_table(total: float, substitute: bool, within: bool, needs_approval: bool) -> None:
    reasons = ApprovalPolicy(500.0).evaluate(_order(total, substitute=substitute, within=within))
    assert bool(reasons) is needs_approval


def test_reasons_are_human_readable() -> None:
    reasons = ApprovalPolicy(500.0).evaluate(_order(900, substitute=True, within=False))
    assert len(reasons) == 2
    assert "spend limit" in reasons[0]
    assert "LACTOSE_FREE" in reasons[1]
