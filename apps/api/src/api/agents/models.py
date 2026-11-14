from pydantic import BaseModel, Field, field_validator

SHARED_AGENT_ID = "agt_mcp"
SHARED_AGENT_NAME = "company-agent"


class Mandate(BaseModel):
    """Company-wide rules every order line must meet (`API_REQUIRED_TAGS`, `API_BANNED_ALLERGENS`)."""

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
    """Who a call acts as. Without authentication every REST and MCP caller is the one shared company agent."""

    agent_id: str
    name: str
    customer: str
    mandate: Mandate


def shared_agent(customer: str, mandate: Mandate) -> AgentPrincipal:
    return AgentPrincipal(agent_id=SHARED_AGENT_ID, name=SHARED_AGENT_NAME, customer=customer, mandate=mandate)
