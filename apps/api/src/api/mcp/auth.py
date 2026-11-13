"""Bearer authentication in front of the MCP streamable HTTP endpoint.

The principal is put on the ASGI scope, which the SDK hands to tools as `request_context.request`.
"""

import json

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

from api.agents.auth import CHALLENGE, authenticate, unauthorized
from api.agents.models import AgentPrincipal
from api.services import Services

PRINCIPAL_KEY = "valio.agent"


class AgentAuthASGI:
    def __init__(self, app: ASGIApp) -> None:
        self._app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        services: Services = scope["app"].state.services
        principal = authenticate(services.agents, Headers(scope=scope).get("authorization"), scope["path"])
        if principal is None:
            body = json.dumps(unauthorized().body()).encode()
            headers = [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
            headers += [(k.lower().encode(), v.encode()) for k, v in CHALLENGE.items()]
            await send({"type": "http.response.start", "status": 401, "headers": headers})
            await send({"type": "http.response.body", "body": body})
            return
        scope[PRINCIPAL_KEY] = principal
        await self._app(scope, receive, send)


def principal_from_scope(scope: Scope) -> AgentPrincipal:
    principal = scope.get(PRINCIPAL_KEY)
    if not isinstance(principal, AgentPrincipal):
        raise unauthorized()
    return principal
