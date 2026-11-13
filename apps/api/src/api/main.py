import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import AsyncOpenAI

from api.agent.loop import Agent, ChatModel, OpenAIChatModel
from api.agent.state import SessionStore
from api.catalog.index import Catalog, load_catalog
from api.config import Settings, get_settings
from api.orders.policy import ApprovalPolicy
from api.orders.service import OrderError, OrderService
from api.orders.store import Store
from api.routes import conversations, health, orders, products, voice
from api.services import Services
from api.valio.client import (
    ValioAuthError,
    ValioClient,
    ValioError,
    ValioNotConfiguredError,
    ValioRateLimitedError,
    ValioValidationError,
)
from api.voice.provider import OpenAICompatibleVoice, VoiceProvider

log = logging.getLogger(__name__)


def _openai_client(base_url: str | None, api_key: str | None, timeout: float) -> AsyncOpenAI | None:
    if not base_url or not api_key:
        return None
    root = base_url.rstrip("/").removesuffix("/chat/completions").removesuffix("/v1")
    return AsyncOpenAI(base_url=f"{root}/v1", api_key=api_key, timeout=timeout)


def create_app(
    cfg: Settings | None = None,
    *,
    catalog: Catalog | None = None,
    valio_transport: httpx.AsyncBaseTransport | None = None,
    chat_model: ChatModel | None = None,
    voice_provider: VoiceProvider | None = None,
) -> FastAPI:
    cfg = cfg or get_settings()
    logging.basicConfig(level=cfg.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")

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
        valio = ValioClient(http, api_key=api_key, customer=cfg.valio_customer, cache_ttl_s=cfg.quote_cache_ttl_s)
        store = Store(cfg.db_path)
        order_service = OrderService(
            store, cat, valio, ApprovalPolicy(cfg.approval_spend_threshold_eur), cfg.valio_customer
        )
        llm_key = cfg.llm_api_key.get_secret_value() if cfg.llm_api_key else None
        llm_client = None if chat_model else _openai_client(cfg.llm_base_url, llm_key, cfg.llm_timeout_s)
        if chat_model is None and llm_client is None:
            log.warning("llm_not_configured: set OPENAI_COMPATIBLE_URL and OPENAI_COMPATIBLE_API_KEY")
        voice_key = cfg.voice_api_key.get_secret_value() if cfg.voice_api_key else None
        app.state.services = Services(
            settings=cfg,
            catalog=cat,
            valio=valio,
            store=store,
            orders=order_service,
            agent=Agent(
                sessions=SessionStore(store),
                model=chat_model or OpenAIChatModel(llm_client, cfg.llm_model),
                catalog=cat,
                valio=valio,
                orders=order_service,
                max_tool_rounds=cfg.llm_max_tool_rounds,
                turns_per_minute=cfg.turns_per_minute,
                ar_max_stack_m=cfg.ar_max_stack_height_m,
            ),
            voice=voice_provider
            or OpenAICompatibleVoice(
                _openai_client(cfg.voice_base_url, voice_key, 30.0),
                stt_model=cfg.voice_stt_model,
                tts_model=cfg.voice_tts_model,
                tts_voice=cfg.voice_tts_voice,
            ),
        )
        try:
            yield
        finally:
            if http:
                await http.aclose()
            if llm_client:
                await llm_client.close()
            store.close()

    is_prod = cfg.environment == "production"
    app = FastAPI(
        title="Junction 2026 API",
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
        return JSONResponse({"code": e.code, "message": e.message, "details": e.details}, status_code=e.status)

    @app.exception_handler(ValioError)
    async def _valio_error(_: Request, e: ValioError) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        status = 502
        if isinstance(e, ValioNotConfiguredError):
            status = 503
        elif isinstance(e, ValioRateLimitedError):
            status = 429
        elif isinstance(e, ValioValidationError):
            status = 422
        elif isinstance(e, ValioAuthError):
            log.error("valio_auth_failed: check API_VALIO_API_KEY")
        return JSONResponse({"code": "upstream_error", "message": str(e)}, status_code=status)

    for router in (health.router, products.router, orders.router, conversations.router, voice.router):
        app.include_router(router, prefix="/api")
    return app


app = create_app()
