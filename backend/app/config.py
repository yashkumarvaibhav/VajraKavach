"""
VajraKavach — Application Configuration
Loads settings from .env using pydantic-settings.
"""

from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
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

    # App
    APP_TITLE: str = "VajraKavach"
    APP_VERSION: str = "0.1.0"
    CORS_ORIGINS: str = '["http://localhost:5173","http://localhost:3000"]'
    UPLOAD_DIR: str = "uploads"
    DEBUG: bool = True

    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
