"""Server-side approval policy. The agent cannot bypass it: placement always goes through `evaluate`."""

from dataclasses import dataclass

from api.orders.models import Order


@dataclass(frozen=True, slots=True)
class SpendLimit:
    amount: float
    source: str


@dataclass(frozen=True, slots=True)
class ApprovalPolicy:
    spend_threshold: float

    def limit_for(self, override: float | None) -> SpendLimit:
        if override is None:
            return SpendLimit(self.spend_threshold, "global threshold")
        return SpendLimit(override, "agent mandate")

    def evaluate(self, order: Order, limit: SpendLimit | None = None) -> list[str]:
        """Reasons the order needs human approval; empty means the agent may place it on its own."""
        limit = limit or self.limit_for(None)
        reasons: list[str] = []
        if order.total > limit.amount:
            reasons.append(
                f"Total {order.total:.2f} {order.currency} exceeds the {limit.amount:.2f} "
                f"{order.currency} spend limit ({limit.source})"
            )
        for line in order.lines:
            if not line.within_preferences:
                what = f"{line.name} (substitute for {line.substitute_for})" if line.substitute_for else line.name
                missing = line.missing_requirements or order.preferences
                reasons.append(f"{what} does not meet the stated requirements ({', '.join(missing)})")
        return reasons
