from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr
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

    llm_base_url: str | None = Field(
        default=None, validation_alias=AliasChoices("OPENAI_COMPATIBLE_URL", "API_LLM_BASE_URL")
    )
    llm_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("OPENAI_COMPATIBLE_API_KEY", "API_LLM_API_KEY")
    )
    llm_model: str = Field(
        default="kimi-k3-1-pro", validation_alias=AliasChoices("OPENAI_COMPATIBLE_MODEL", "API_LLM_MODEL")
    )
    llm_timeout_s: float = 60.0
    llm_max_tool_rounds: int = 6

    voice_base_url: str | None = None
    voice_api_key: SecretStr | None = None
    voice_stt_model: str = "whisper-1"
    voice_tts_model: str = "tts-1"
    voice_tts_voice: str = "alloy"
    voice_max_upload_bytes: int = 5 * 1024 * 1024
    voice_max_tts_chars: int = 1200

    turns_per_minute: int = 20

    ar_max_stack_height_m: float = 1.6

    @property
    def catalog_path(self) -> Path:
        return self.data_dir / "valio_aimo_junction26_product_data.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
