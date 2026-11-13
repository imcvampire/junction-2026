from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="API_", extra="ignore")

    environment: str = "development"
    log_level: str = "INFO"
    cors_origins: list[str] = []


@lru_cache
def get_settings() -> Settings:
    return Settings()
