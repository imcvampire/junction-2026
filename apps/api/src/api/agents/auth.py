"""Bearer-key authentication shared by the REST routes and the MCP endpoint."""

import logging
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.agents.models import AgentPrincipal
from api.agents.registry import AgentRegistry
from api.orders.service import OrderError

log = logging.getLogger(__name__)

CHALLENGE = {"WWW-Authenticate": 'Bearer realm="valio-aimo-agent"'}

_bearer = HTTPBearer(auto_error=False, description="Agent key issued by `mise run agent:create`")


def unauthorized() -> OrderError:
    return OrderError("unauthorized", "Missing or invalid agent key", status=401, headers=CHALLENGE)


def bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    return token.strip() or None if scheme.lower() == "bearer" else None


def authenticate(registry: AgentRegistry, authorization: str | None, path: str) -> AgentPrincipal | None:
    token = bearer_token(authorization)
    principal = registry.resolve(token) if token else None
    if principal is None:
        log.info("agent_auth_failed path=%s has_token=%s", path, token is not None)
    return principal


def require_agent(
    request: Request, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> AgentPrincipal:
    registry: AgentRegistry = request.app.state.services.agents
    principal = authenticate(registry, f"Bearer {creds.credentials}" if creds else None, request.url.path)
    if principal is None:
        raise unauthorized()
    request.state.agent_id = principal.agent_id
    return principal


Agent = Annotated[AgentPrincipal, Depends(require_agent)]
