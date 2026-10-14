from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite:///./interview_platform.db"
    supabase_url: str = ""
    supabase_jwt_secret: str = "development-only-change-me"
    supabase_jwt_audience: str = "authenticated"
    cors_origins: str = "http://localhost:5173"
    email_delivery_mode: str = "console"
    invitation_ttl_hours: int = 72


@lru_cache
def get_settings() -> Settings:
    return Settings()

