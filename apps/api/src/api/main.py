import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import Settings, get_settings
from api.routes import health


def create_app(cfg: Settings | None = None) -> FastAPI:
    cfg = cfg or get_settings()
    logging.basicConfig(level=cfg.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    is_prod = cfg.environment == "production"
    app = FastAPI(
        title="Junction 2026 API",
        docs_url=None if is_prod else "/api/docs",
        openapi_url=None if is_prod else "/api/openapi.json",
    )

    if cfg.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cfg.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(health.router, prefix="/api")
    return app


app = create_app()
