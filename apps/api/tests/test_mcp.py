import asyncio
import json
import re
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, cast

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.types import CallToolResult, TextContent

from api.catalog.index import Catalog
from api.config import Settings
from api.main import create_app
from api.mcp.server import MCP_AGENT_ID, TOOL_NAMES
from api.services import Services
from tests.conftest import DELIVERY, FakeValio, bearer

SKILL_DIR = Path(__file__).resolve().parents[3] / "skills" / "valio-aimo-purchasing"
Body = Callable[[ClientSession, FastAPI], Awaitable[None]]


@asynccontextmanager
async def mcp_session(app: FastAPI) -> AsyncGenerator[ClientSession]:
    async with (
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as http,
        streamable_http_client("http://testserver/mcp", http_client=http) as (read, write, _),
        ClientSession(read, write) as session,
    ):
        await session.initialize()
        yield session


def run_mcp(settings: Settings, catalog: Catalog, fake: FakeValio, body: Body) -> None:
    app = create_app(settings, catalog=catalog, valio_transport=httpx.MockTransport(fake.handler))

    async def main() -> None:
        async with app.router.lifespan_context(app), mcp_session(app) as session:
            await body(session, app)

    asyncio.run(main())


def rest_key(app: FastAPI, customer: str) -> str:
    return cast(Services, app.state.services).agents.create("ops", customer)[1]


def structured(result: CallToolResult) -> dict[str, Any]:
    assert not result.isError, result.content
    assert result.structuredContent is not None
    return result.structuredContent


def error_body(result: CallToolResult) -> dict[str, Any]:
    assert result.isError
    return json.loads(cast(TextContent, result.content[0]).text)


async def quote_milk(session: ClientSession, litres: float = 1000) -> dict[str, Any]:
    return structured(
        await session.call_tool(
            "quote",
            {
                "items": [
                    {"product_id": p, "amount": {"value": litres, "unit": "L"}} for p in ("462775", "464119", "464073")
                ],
                "delivery_date": DELIVERY.isoformat(),
                "requirements": ["LACTOSE_FREE"],
                "request_text": "I need 1,000 litres of lactose-free milk by Monday.",
            },
        )
    )


async def place_best(session: ClientSession, quote: dict[str, Any], ref: str = "ref-1") -> CallToolResult:
    best = next(o for o in quote["options"] if o["cheapest_covering_option"])
    return await session.call_tool(
        "place_order",
        {
            "quote_id": quote["quote_id"],
            "lines": [{"product_id": best["product_id"], "quantity": best["quantity"]}],
            "reason": "Cheapest lactose-free milk covering the date",
            "client_reference": ref,
        },
    )


def test_tools_are_listed_with_schemas_and_annotations(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(session: ClientSession, _: FastAPI) -> None:
        tools = {t.name: t for t in (await session.list_tools()).tools}
        assert set(tools) == set(TOOL_NAMES)
        assert all(t.outputSchema for t in tools.values())
        assert tools["get_order"].annotations and tools["get_order"].annotations.readOnlyHint
        place = tools["place_order"].annotations
        assert place and place.idempotentHint and not place.destructiveHint
        assert {"quote_id", "lines", "reason", "client_reference"} <= set(tools["place_order"].inputSchema["required"])

    run_mcp(settings, catalog, fake_valio, body)


def test_reference_request_escalates_then_approval_is_visible(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(session: ClientSession, app: FastAPI) -> None:
        me = structured(await session.call_tool("whoami", {}))
        assert me["spend_limit_eur"] == 500

        hits = structured(
            await session.call_tool("search_products", {"query": "milk", "required_tags": ["LACTOSE_FREE"]})
        )
        assert hits["count"] >= 3

        quote = await quote_milk(session)
        best = quote["options"][0]
        assert best["product_id"] == "464119" and best["quantity"] == 100 and best["cheapest_covering_option"]

        result = await place_best(session, quote)
        order = structured(result)
        assert order["status"] == "pending_approval"
        summary = cast(TextContent, result.content[0]).text
        assert "pending_approval" in summary and "spend limit" in summary

        queue = structured(await session.call_tool("list_pending_approvals", {}))
        assert [o["order_id"] for o in queue["orders"]] == [order["order_id"]]
        decided = await session.call_tool("approve_order", {"order_id": order["order_id"], "reason": "gala"})
        assert structured(decided)["decision"]["decided_by"]["name"] == me["name"]
        assert f"approved by {me['name']}" in cast(TextContent, decided.content[0]).text
        seen = structured(await session.call_tool("get_order", {"order_id": order["order_id"]}))
        assert seen["status"] == "approved" and seen["decision"]["decided_by"]["agent_id"] == me["agent_id"]
        audit = structured(await session.call_tool("get_order_audit", {"order_id": order["order_id"]}))
        assert "options considered" in audit["text"] and f"Approved by {me['name']} (agt_" in audit["text"]
        listed = structured(await session.call_tool("list_orders", {"status": "approved"}))
        assert [o["order_id"] for o in listed["orders"]] == [order["order_id"]]

    run_mcp(settings, catalog, fake_valio, body)


def test_every_mcp_client_is_the_same_shared_agent(settings: Settings, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(session: ClientSession, app: FastAPI) -> None:
        me = structured(await session.call_tool("whoami", {}))
        assert me["agent_id"] == MCP_AGENT_ID and me["customer"] == settings.valio_customer
        order = structured(await place_best(session, await quote_milk(session)))
        assert order["status"] == "pending_approval"
        async with mcp_session(app) as other:
            assert structured(await other.call_tool("whoami", {}))["agent_id"] == MCP_AGENT_ID
            tools = {t.name: t for t in (await other.list_tools()).tools}
            for name in ("approve_order", "reject_order"):
                hints = tools[name].annotations
                assert hints and hints.destructiveHint and not hints.readOnlyHint
                assert {"order_id", "reason"} <= set(tools[name].inputSchema["required"])
            mine = structured(await other.call_tool("list_orders", {}))
            assert [o["order_id"] for o in mine["orders"]] == [order["order_id"]]
            reject = {"order_id": order["order_id"], "reason": "no"}
            rejected = structured(await other.call_tool("reject_order", reject))
            assert rejected["status"] == "rejected" and rejected["decision"]["decided_by"]["agent_id"] == MCP_AGENT_ID

        http = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        async with http:
            path = f"/api/agent/v1/orders/{order['order_id']}"
            same = await http.get(path, headers=bearer(rest_key(app, settings.valio_customer)))
            assert same.status_code == 200 and same.json()["status"] == "rejected"
            rival = await http.get(path, headers=bearer(rest_key(app, "hotel-2")))
            assert rival.status_code == 404

    run_mcp(settings, catalog, fake_valio, body)


def test_shared_agent_survives_restart_and_follows_the_configured_customer(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    for customer in ("hotel-1", "hotel-2"):
        app = create_app(
            settings.model_copy(update={"valio_customer": customer}),
            catalog=catalog,
            valio_transport=httpx.MockTransport(fake_valio.handler),
        )
        with TestClient(app) as c:
            agents = cast(Services, cast(FastAPI, c.app).state.services).agents.list()
            assert [(a.agent_id, a.customer) for a in agents] == [(MCP_AGENT_ID, customer)]


def test_order_within_authority_is_placed(settings: Settings, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(session: ClientSession, _: FastAPI) -> None:
        order = structured(await place_best(session, await quote_milk(session, litres=100)))
        assert order["status"] == "placed" and order["total"] == 154.0

    run_mcp(settings, catalog, fake_valio, body)


def test_refusals_are_tool_errors_with_codes(settings: Settings, catalog: Catalog, fake_valio: FakeValio) -> None:
    async def body(session: ClientSession, _: FastAPI) -> None:
        quote = await quote_milk(session, litres=100)
        fake_valio.prices["464119"] = 16.0
        assert error_body(await place_best(session, quote))["code"] == "quote_changed"

        bad = await session.call_tool("quote", {"items": [], "delivery_date": DELIVERY.isoformat()})
        assert error_body(bad)["code"] == "invalid_arguments"
        schema = error_body(await session.call_tool("place_order", {"quote_id": quote["quote_id"]}))
        assert schema["code"] == "invalid_arguments"
        assert {e["field"] for e in schema["details"]["errors"]} >= {"lines", "reason", "client_reference"}
        missing = await session.call_tool("get_order", {"order_id": "ord_nope"})
        assert error_body(missing)["code"] == "order_not_found"

    run_mcp(settings, catalog, fake_valio, body)


def test_mcp_needs_no_key_but_rejects_foreign_origins(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    app = create_app(settings, catalog=catalog, valio_transport=httpx.MockTransport(fake_valio.handler))
    init: dict[str, Any] = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
    headers = {"Accept": "application/json, text/event-stream"}
    with TestClient(app) as c:
        assert c.post("/mcp", json=init, headers=headers).status_code != 401
        assert c.post("/mcp", json=init, headers={**headers, "Origin": "https://evil.example"}).status_code == 403
        keyless = c.get("/api/agent/v1/me", headers=bearer(f"keyless:{MCP_AGENT_ID}"))
        assert keyless.status_code == 401


def test_skill_mentions_only_real_tools() -> None:
    text = "\n".join(p.read_text() for p in SKILL_DIR.rglob("*.md"))
    mentioned = set(re.findall(r"`([a-z_]+)`", text)) & {
        "whoami",
        "search_products",
        "get_product",
        "quote",
        "place_order",
        "get_order",
        "list_orders",
        "get_order_audit",
        "list_pending_approvals",
        "approve_order",
        "reject_order",
        "get_order_status",
        "create_order_draft",
        "agree_order",
    }
    assert mentioned == set(TOOL_NAMES)
