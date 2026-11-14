import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mcp.server.fastmcp.server import StreamableHTTPASGIApp
from starlette.routing import Route

from api.agents.models import Mandate, shared_agent
from api.catalog.index import Catalog, load_catalog
from api.config import Settings, get_settings
from api.mcp.server import build_mcp_server
from api.orders.policy import ApprovalPolicy
from api.orders.service import OrderError, OrderService
from api.orders.store import Store
from api.procurement.errors import describe_valio_error
from api.procurement.service import ProcurementService
from api.research.oxylabs import OxylabsSearch
from api.research.service import ResearchService, WebSearch
from api.routes import agent, health, orders, products
from api.services import Services
from api.valio.client import ValioClient, ValioError

log = logging.getLogger(__name__)


def create_app(
    cfg: Settings | None = None,
    *,
    catalog: Catalog | None = None,
    valio_transport: httpx.AsyncBaseTransport | None = None,
    web_search: WebSearch | None = None,
) -> FastAPI:
    cfg = cfg or get_settings()
    logging.basicConfig(level=cfg.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    mcp_server = build_mcp_server(cfg)
    mcp_server.streamable_http_app()  # creates the session manager the /mcp route serves

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        cat = catalog or await asyncio.to_thread(load_catalog, cfg.data_dir)
        api_key = cfg.valio_api_key.get_secret_value() if cfg.valio_api_key else None
        base_url = cfg.valio_base_url or ("http://valio.test" if valio_transport else None)
        http = (
            httpx.AsyncClient(base_url=base_url, timeout=cfg.valio_timeout_s, transport=valio_transport)
            if base_url
            else None
        )
        if http is None or not api_key:
            log.warning("valio_not_configured: set API_VALIO_BASE_URL and API_VALIO_API_KEY")
        valio = ValioClient(http, api_key=api_key, cache_ttl_s=cfg.quote_cache_ttl_s)
        oxylabs = (
            OxylabsSearch(
                cfg.oxylabs_api_key.get_secret_value(),
                base_url=cfg.oxylabs_base_url,
                location=cfg.oxylabs_location,
                max_results=cfg.research_results_per_product,
            )
            if web_search is None and cfg.oxylabs_api_key
            else None
        )
        if web_search is None and oxylabs is None:
            log.warning("research_not_configured: set API_OXYLABS_API_KEY to enable research_substitutes")
        store = Store(cfg.db_path)
        orders = OrderService(store)
        app.state.services = Services(
            settings=cfg,
            catalog=cat,
            valio=valio,
            store=store,
            orders=orders,
            procurement=ProcurementService(
                store,
                cat,
                valio,
                ApprovalPolicy(cfg.approval_spend_threshold_eur),
                orders=orders,
                quote_ttl_s=cfg.quote_ttl_s,
                quotes_per_minute=cfg.agent_quotes_per_minute,
            ),
            research=ResearchService(
                cat,
                web_search or oxylabs,
                timeout_s=cfg.research_timeout_s,
                cache_ttl_s=cfg.research_cache_ttl_s,
                per_minute=cfg.research_per_minute,
            ),
            agent=shared_agent(
                cfg.valio_customer,
                Mandate(required_tags=cfg.required_tags, banned_allergens=cfg.banned_allergens),
            ),
        )
        try:
            async with mcp_server.session_manager.run():
                yield
        finally:
            if http:
                await http.aclose()
            if oxylabs:
                await oxylabs.aclose()
            store.close()

    is_prod = cfg.environment == "production"
    app = FastAPI(
        title="Valio Aimo agent API",
        docs_url=None if is_prod else "/api/docs",
        openapi_url=None if is_prod else "/api/openapi.json",
        lifespan=lifespan,
    )

    if cfg.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cfg.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.exception_handler(OrderError)
    async def _order_error(_: Request, e: OrderError) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        return JSONResponse(e.body(), status_code=e.status, headers=e.headers)

    @app.exception_handler(ValioError)
    async def _valio_error(_: Request, e: ValioError) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        status, body = describe_valio_error(e)
        return JSONResponse(body, status_code=status)

    for router in (health.router, products.router, orders.router, agent.router):
        app.include_router(router, prefix="/api")

    app.router.routes.append(Route("/mcp", endpoint=StreamableHTTPASGIApp(mcp_server.session_manager)))
    return app


app = create_app()
