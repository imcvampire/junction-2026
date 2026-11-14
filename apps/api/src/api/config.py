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
    # Company mandate: every order line must carry these tags and contain none of these GS1 allergen codes.
    # JSON lists, e.g. API_REQUIRED_TAGS='["LACTOSE_FREE"]', API_BANNED_ALLERGENS='["AM"]'.
    required_tags: list[str] = []
    banned_allergens: list[str] = []

    quote_ttl_s: float = 900.0
    agent_quotes_per_minute: int = 30

    # Substitute web research (Oxylabs Web API search). Without a key the tool answers research_not_configured.
    oxylabs_api_key: SecretStr | None = None
    oxylabs_base_url: str = "https://webapi.oxylabs.io"
    # ISO 3166-1 alpha-2 search locale; None uses the provider's default.
    oxylabs_location: str | None = "FI"
    research_results_per_product: int = 3
    research_timeout_s: float = 30.0
    research_cache_ttl_s: float = 3600.0
    research_per_minute: int = 6

    # DNS-rebinding protection for /mcp. Add the public host (e.g. "api.example.com") when deployed.
    mcp_allowed_hosts: list[str] = ["127.0.0.1:*", "localhost:*", "[::1]:*"]
    mcp_allowed_origins: list[str] = ["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"]

    @property
    def catalog_path(self) -> Path:
        return self.data_dir / "valio_aimo_junction26_product_data.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
