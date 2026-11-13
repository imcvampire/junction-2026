from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

_ALLERGEN_CODE = r"^[A-Z0-9]{2,3}$"

Role = Literal["member", "admin"]
ROLES: tuple[Role, ...] = ("member", "admin")


class Mandate(BaseModel):
    """What one agent may do on its own. Unset fields fall back to the global defaults."""

    spend_limit_eur: float | None = Field(default=None, ge=0, description="Per-order limit; None = global threshold")
    required_tags: list[str] = Field(default_factory=list[str], max_length=20)
    banned_allergens: list[str] = Field(default_factory=list[str], max_length=20)

    @field_validator("banned_allergens")
    @classmethod
    def _upper_codes(cls, v: list[str]) -> list[str]:
        return sorted({a.strip().upper() for a in v if a.strip()})

    @field_validator("required_tags")
    @classmethod
    def _strip_tags(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(t.strip() for t in v if t.strip()))

    def requirement_tags(self) -> list[str]:
        """Mandate rules expressed as catalog requirement tags, e.g. `LACTOSE_FREE`, `no:AM`."""
        return [*self.required_tags, *(f"no:{a}" for a in self.banned_allergens)]


class AgentPrincipal(BaseModel):
    agent_id: str
    name: str
    customer: str
    mandate: Mandate
    created_at: datetime
    role: Role = "member"

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


class AgentRecord(AgentPrincipal):
    disabled: bool
