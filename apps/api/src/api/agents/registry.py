"""Agent credentials: opaque bearer keys, stored only as SHA-256 hashes.

Keys carry 256 bits of entropy, so a plain (unsalted) hash is sufficient, and lookup by hash avoids a
timing-sensitive string comparison.
"""

import hashlib
import logging
import secrets
import uuid

from api.agents.models import ROLES, AgentPrincipal, AgentRecord, Mandate, Role
from api.orders.models import utcnow
from api.orders.store import Store

log = logging.getLogger(__name__)

KEY_PREFIX = "vaa_"
_MAX_KEY_LEN = 128


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


class AgentRegistry:
    def __init__(self, store: Store) -> None:
        self._store = store

    def create(
        self, name: str, customer: str, mandate: Mandate | None = None, role: Role = "member"
    ) -> tuple[AgentPrincipal, str]:
        """Register an agent. Returns the plaintext key, which is never stored or shown again."""
        name, customer = name.strip(), customer.strip()
        if not name or not customer:
            raise ValueError("name and customer are required")
        _check_role(role)
        key = KEY_PREFIX + secrets.token_urlsafe(32)
        principal = AgentPrincipal(
            agent_id=f"agt_{uuid.uuid4().hex[:12]}",
            name=name,
            customer=customer,
            mandate=mandate or Mandate(),
            created_at=utcnow(),
            role=role,
        )
        self._store.insert_agent(
            principal.agent_id,
            principal.name,
            principal.customer,
            hash_key(key),
            principal.mandate.model_dump_json(),
            principal.created_at,
            principal.role,
        )
        log.info(
            "agent_created agent_id=%s customer=%s role=%s", principal.agent_id, principal.customer, principal.role
        )
        return principal, key

    def resolve(self, key: str) -> AgentPrincipal | None:
        """The enabled agent holding `key`, or None. Never logs the key."""
        if not key.startswith(KEY_PREFIX) or len(key) > _MAX_KEY_LEN:
            return None
        row = self._store.agent_by_key_hash(hash_key(key))
        if row is None:
            return None
        record = _record(row)
        if record.disabled:
            log.warning("agent_disabled_key_used agent_id=%s", record.agent_id)
            return None
        return AgentPrincipal.model_validate(record.model_dump())

    def list(self) -> list[AgentRecord]:
        return [_record(r) for r in self._store.list_agents()]

    def set_disabled(self, agent_id: str, disabled: bool = True) -> bool:
        return self._store.set_agent_disabled(agent_id, disabled)

    def set_role(self, agent_id: str, role: Role) -> bool:
        """Promote or demote a key without reissuing it. Takes effect on the key's next request."""
        _check_role(role)
        changed = self._store.set_agent_role(agent_id, role)
        if changed:
            log.info("agent_role_set agent_id=%s role=%s", agent_id, role)
        return changed


def _check_role(role: str) -> None:
    if role not in ROLES:
        raise ValueError(f"role must be one of {', '.join(ROLES)}")


def _record(row: tuple[object, ...]) -> AgentRecord:
    agent_id, name, customer, mandate, created_at, disabled, role = row
    return AgentRecord(
        agent_id=str(agent_id),
        name=str(name),
        customer=str(customer),
        mandate=Mandate.model_validate_json(str(mandate)),
        created_at=str(created_at),  # pyright: ignore[reportArgumentType]
        disabled=bool(disabled),
        role=str(role),  # pyright: ignore[reportArgumentType]
    )
