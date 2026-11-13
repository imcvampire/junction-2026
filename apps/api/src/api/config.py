from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

DATA_DIR = Path(__file__).resolve().parents[2] / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="API_", extra="ignore")

    environment: str = "development"
    log_level: str = "INFO"
    cors_origins: list[str] = []

    data_dir: Path = DATA_DIR
    db_path: Path = DATA_DIR / "app.sqlite3"

    valio_base_url: str | None = None
    valio_api_key: SecretStr | None = None
    valio_customer: str = "junction-demo"
    valio_timeout_s: float = 10.0
    quote_cache_ttl_s: float = 180.0

    approval_spend_threshold_eur: float = 500.0

    quote_ttl_s: float = 900.0
    agent_quotes_per_minute: int = 30

    # DNS-rebinding protection for /mcp. Add the public host (e.g. "api.example.com") when deployed.
    mcp_allowed_hosts: list[str] = ["127.0.0.1:*", "localhost:*", "[::1]:*"]
    mcp_allowed_origins: list[str] = ["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"]

    @property
    def catalog_path(self) -> Path:
        return self.data_dir / "valio_aimo_junction26_product_data.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
