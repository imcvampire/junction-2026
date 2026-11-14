"""Server-side approval policy. The agent cannot bypass it: placement always goes through `evaluate`."""

from dataclasses import dataclass

from api.orders.models import Order


@dataclass(frozen=True, slots=True)
class ApprovalPolicy:
    spend_threshold: float

    def evaluate(self, order: Order) -> list[str]:
        """Reasons the order needs human approval; empty means the agent may place it on its own.

        Only spend escalates, and the limit applies to each order on its own. A line that misses the
        buyer's own preferences is the buyer's pick, and a line that breaks the company mandate never
        gets this far (`mandate_violation` at placement).
        """
        if order.total <= self.spend_threshold:
            return []
        return [
            f"Total {order.total:.2f} {order.currency} exceeds the {self.spend_threshold:.2f} "
            f"{order.currency} per-order spend limit"
        ]
