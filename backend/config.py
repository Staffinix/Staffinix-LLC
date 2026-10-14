from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

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
    redis_url: str = "redis://localhost:6379/0"
    max_request_bytes: int = 1_048_576
    rate_limit_per_minute: int = 120

    @model_validator(mode="after")
    def validate_production(self):
        if self.app_env.casefold() != "production":
            return self
        errors = []
        if not self.database_url.startswith(("postgresql://", "postgresql+psycopg://")):
            errors.append("DATABASE_URL must use PostgreSQL")
        if not self.supabase_url.startswith("https://") or not self.supabase_publishable_key:
            errors.append("Supabase Auth must be configured")
        if (
            self.email_delivery_mode != "resend"
            or not self.resend_api_key
            or "paste_your_key_here" in self.resend_api_key
            or "resend.dev" in self.email_from
            or "your-verified-domain.com" in self.email_from
        ):
            errors.append("Resend email delivery must be configured")
        if not self.public_app_url.startswith("https://"):
            errors.append("PUBLIC_APP_URL must use HTTPS")
        origins = [origin.strip() for origin in self.cors_origins.split(",")]
        if not origins or any(not origin or origin == "*" or "localhost" in origin or "127.0.0.1" in origin for origin in origins):
            errors.append("CORS_ORIGINS must list production origins")
        if not self.openrouter_api_key or "paste_your_key_here" in self.openrouter_api_key:
            errors.append("OpenRouter must be configured")
        if "localhost" in self.redis_url or "127.0.0.1" in self.redis_url:
            errors.append("REDIS_URL must use a production Redis service")
        if errors:
            raise ValueError("Invalid production configuration: " + "; ".join(errors))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

