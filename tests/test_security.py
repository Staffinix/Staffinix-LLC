import pytest
from pydantic import ValidationError

from backend.config import Settings
from backend.main import rate_policy


def production_settings(**overrides):
    values = {
        "app_env": "production",
        "database_url": "postgresql+psycopg://app:password@db.internal/app",
        "supabase_url": "https://project.supabase.co",
        "supabase_publishable_key": "sb_publishable_example",
        "cors_origins": "https://interviews.example.com",
        "email_delivery_mode": "resend",
        "resend_api_key": "re_example",
        "email_from": "InterviewOS <interviews@example.com>",
        "public_app_url": "https://interviews.example.com",
        "openrouter_api_key": "sk-or-v1-example",
        "redis_url": "rediss://cache.internal:6379/0",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_production_configuration_fails_closed():
    with pytest.raises(ValidationError, match="DATABASE_URL must use PostgreSQL"):
        production_settings(database_url="sqlite:///app.db")
    assert production_settings().app_env == "production"


def test_sensitive_routes_have_tighter_rate_limits():
    assert rate_policy("/api/v1/interviews/id/questions/generate") == ("ai-generation", 10)
    assert rate_policy("/api/v1/invitations") == ("invitations", 20)
