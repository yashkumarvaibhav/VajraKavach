"""
VajraKavach — Application Configuration
Loads settings from .env using pydantic-settings.
"""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import json


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://vajrakavach:changeme@localhost:5432/vajrakavach_db"

    # JWT
    JWT_SECRET_KEY: str = "change-this-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Encryption (MUST be a stable Fernet key — never use placeholder)
    FERNET_SECRET_KEY: str = ""

    # TOTP
    TOTP_ISSUER: str = "VajraKavach"

    # PKI
    PKI_PRIVATE_KEY_PATH: str = "certs/server.key"
    PKI_CERTIFICATE_PATH: str = "certs/server.crt"
    PKI_KEY_PASSPHRASE: str = ""

    # App
    APP_TITLE: str = "VajraKavach"
    APP_VERSION: str = "0.1.0"
    CORS_ORIGINS: str = '["http://localhost:5173","http://localhost:3000"]'
    UPLOAD_DIR: str = "uploads"
    DEBUG: bool = False
    DECEPTION_DEMO_MODE: bool = False
    DECEPTION_ACCESS_SCORE: int = 15
    DECEPTION_SUBMIT_SCORE: int = 10
    DECEPTION_REPEAT_SCORE: int = 10
    DECEPTION_WARNING_THRESHOLD: int = 21   # score > 20
    DECEPTION_DELAY_THRESHOLD: int = 31     # score > 30
    DECEPTION_TIMEOUT_THRESHOLD: int = 41   # score > 40
    DECEPTION_REPEAT_WINDOW_SECONDS: int = 300
    DECEPTION_DECAY_POINTS: int = 5
    DECEPTION_DECAY_INTERVAL_MINUTES: int = 20
    DECEPTION_DELAY_SECONDS: int = 2
    DECEPTION_TIMEOUT_MINUTES: int = 10
    DECEPTION_PAYLOAD_HASH_MAX_LEN: int = 4096

    @field_validator("DEBUG", "DECEPTION_DEMO_MODE", mode="before")
    @classmethod
    def parse_debug_flag(cls, value):
        """Accept common env-style debug strings instead of crashing on startup."""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug", "dev", "development"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", "prod", "production"}:
                return False
        return value

    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)

settings = Settings()
