"""Server-side approval policy. The agent cannot bypass it: placement always goes through `evaluate`."""

from dataclasses import dataclass

from api.orders.models import Order


@dataclass(frozen=True, slots=True)
class ApprovalPolicy:
    spend_threshold: float

    def evaluate(self, order: Order) -> list[str]:
        """Reasons the order needs human approval; empty means the buyer's own agreement suffices."""
        reasons: list[str] = []
        if order.total > self.spend_threshold:
            reasons.append(
                f"Total {order.total:.2f} {order.currency} exceeds the {self.spend_threshold:.2f} "
                f"{order.currency} spend limit"
            )
        for line in order.lines:
            if not line.within_preferences:
                what = f"{line.name} (substitute for {line.substitute_for})" if line.substitute_for else line.name
                reasons.append(f"{what} does not meet the stated preferences ({', '.join(order.preferences)})")
        return reasons
