import os
import logging

from pydantic_settings import BaseSettings
from functools import lru_cache

logger = logging.getLogger(__name__)

_INSECURE_DEFAULT_KEY = "change-me-in-production-use-openssl-rand-hex-32"


class Settings(BaseSettings):
    # Postgres
    database_url: str = "postgresql://supplypulse:supplypulse@postgres:5432/supplypulse"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # Auth
    secret_key: str = _INSECURE_DEFAULT_KEY
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # File uploads
    upload_dir: str = "/app/uploads"

    # CORS
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # LLM
    llm_provider: str = "mock"  # "mock" | "openai"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # Email / SMTP (optional - logs in dev mode if not set)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # Environment
    environment: str = "development"  # "development" | "production"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore", "env_ignore_empty": True}


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    if s.secret_key == _INSECURE_DEFAULT_KEY:
        logger.warning(
            "WARNING: SECRET_KEY is set to the insecure default. "
            "Set a strong SECRET_KEY env var for production. "
            "Generate one with: openssl rand -hex 32"
        )
    return s
