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

from api.agents.models import Mandate
from api.catalog.index import Catalog
from api.config import Settings
from api.main import create_app
from api.mcp.server import ADMIN_TOOLS, TOOL_NAMES
from api.services import Services
from tests.conftest import DELIVERY, FakeValio, bearer

SKILL_DIR = Path(__file__).resolve().parents[3] / "skills" / "valio-aimo-purchasing"
Body = Callable[[ClientSession, FastAPI], Awaitable[None]]


@asynccontextmanager
async def mcp_session(app: FastAPI, key: str) -> AsyncGenerator[ClientSession]:
    async with (
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver", headers=bearer(key)
        ) as http,
        streamable_http_client("http://testserver/mcp", http_client=http) as (read, write, _),
        ClientSession(read, write) as session,
    ):
        await session.initialize()
        yield session


def run_mcp(settings: Settings, catalog: Catalog, fake: FakeValio, body: Body, **mandate: Any) -> None:
    app = create_app(settings, catalog=catalog, valio_transport=httpx.MockTransport(fake.handler))

    async def main() -> None:
        async with app.router.lifespan_context(app):
            services = cast(Services, app.state.services)
            _, key = services.agents.create("hotel-agent", "hotel-1", Mandate(**mandate))
            async with mcp_session(app, key) as session:
                await body(session, app)

    asyncio.run(main())


def admin_key(app: FastAPI, customer: str = "hotel-1") -> str:
    return cast(Services, app.state.services).agents.create("ops", customer, role="admin")[1]


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
        assert set(tools) == set(TOOL_NAMES) - ADMIN_TOOLS
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

        denied = await session.call_tool("approve_order", {"order_id": order["order_id"], "reason": "mine"})
        assert error_body(denied)["code"] == "forbidden"
        async with mcp_session(app, admin_key(app)) as admin:
            queue = structured(await admin.call_tool("list_pending_approvals", {}))
            assert [o["order_id"] for o in queue["orders"]] == [order["order_id"]]
            decided = await admin.call_tool("approve_order", {"order_id": order["order_id"], "reason": "gala"})
            assert structured(decided)["decision"]["decided_by"]["name"] == "ops"
            assert "approved by ops" in cast(TextContent, decided.content[0]).text
        seen = structured(await session.call_tool("get_order", {"order_id": order["order_id"]}))
        assert seen["status"] == "approved" and seen["decision"]["decided_by"]["role"] == "admin"
        audit = structured(await session.call_tool("get_order_audit", {"order_id": order["order_id"]}))
        assert "options considered" in audit["text"] and "Approved by ops (agt_" in audit["text"]
        listed = structured(await session.call_tool("list_orders", {"status": "approved"}))
        assert [o["order_id"] for o in listed["orders"]] == [order["order_id"]]

    run_mcp(settings, catalog, fake_valio, body)


def test_admin_tools_are_listed_only_to_admin_keys_and_refused_to_members(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    async def body(member: ClientSession, app: FastAPI) -> None:
        async with mcp_session(app, admin_key(app)) as admin:
            tools = {t.name: t for t in (await admin.list_tools()).tools}
            assert set(tools) == set(TOOL_NAMES)
            for name in ("approve_order", "reject_order"):
                hints = tools[name].annotations
                assert hints and hints.destructiveHint and not hints.readOnlyHint
                assert {"order_id", "reason"} <= set(tools[name].inputSchema["required"])
            me = structured(await admin.call_tool("whoami", {}))
            assert me["role"] == "admin" and me["can_approve"] is True
            company = structured(await admin.call_tool("list_orders", {"scope": "company"}))
            assert company["orders"] == []

        assert ADMIN_TOOLS.isdisjoint(t.name for t in (await member.list_tools()).tools)
        me = structured(await member.call_tool("whoami", {}))
        assert me["role"] == "member" and me["can_approve"] is False
        for name, args in (
            ("list_pending_approvals", {}),
            ("reject_order", {"order_id": "ord_x", "reason": "no"}),
            ("list_orders", {"scope": "company"}),
        ):
            assert error_body(await member.call_tool(name, args))["code"] == "forbidden", name

    run_mcp(settings, catalog, fake_valio, body)


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


def test_unauthenticated_and_foreign_origin_requests_are_rejected(
    settings: Settings, catalog: Catalog, fake_valio: FakeValio
) -> None:
    app = create_app(settings, catalog=catalog, valio_transport=httpx.MockTransport(fake_valio.handler))
    init: dict[str, Any] = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
    headers = {"Accept": "application/json, text/event-stream"}
    with TestClient(app) as c:
        res = c.post("/mcp", json=init, headers=headers)
        assert res.status_code == 401 and res.headers["WWW-Authenticate"].startswith("Bearer")
        assert c.post("/mcp", json=init, headers={**headers, **bearer("vaa_wrong")}).status_code == 401

        _, key = cast(Services, cast(FastAPI, c.app).state.services).agents.create("x", "c")
        evil = c.post("/mcp", json=init, headers={**headers, **bearer(key), "Origin": "https://evil.example"})
        assert evil.status_code == 403


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
