from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite:///./interview_platform.db"
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwt_audience: str = "authenticated"
    cors_origins: str = "http://localhost:5173"
    email_delivery_mode: str = "console"
    resend_api_key: str = ""
    email_from: str = "InterviewOS <onboarding@resend.dev>"
    public_app_url: str = "http://localhost:5173"
    invitation_ttl_hours: int = 72
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "openai/gpt-4o-mini"
    openrouter_app_name: str = "InterviewOS"


@lru_cache
def get_settings() -> Settings:
    return Settings()

