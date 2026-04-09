from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]
ENV_FILE = ROOT_DIR / ".env"
DEFAULT_JWT_SECRET = "change-this-in-production-with-at-least-32-bytes"


class Settings(BaseSettings):
    project_name: str = "VERVE FDS Infra"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./fds_infra.db"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    backend_cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    admin_email: str = "admin@verve.local"
    admin_password: str = "Admin1234!"
    demo_user_email: str = "trader@verve.local"
    demo_user_password: str = "Trader1234!"
    second_user_email: str = "analyst@verve.local"
    second_user_password: str = "Analyst1234!"
    auto_seed: bool = True
    high_amount_threshold: int = 1_000_000
    abnormal_region_codes: list[str] = Field(default_factory=lambda: ["CN", "RU", "KP"])
    multi_account_window_minutes: int = 10
    login_failure_window_minutes: int = 30
    order_spike_multiplier: float = 3.0
    order_cancel_burst_threshold: int = 3
    order_cancel_window_minutes: int = 15
    immediate_order_window_minutes: int = 10

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("backend_cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip()
            if value.startswith("[") and value.endswith("]"):
                import json

                return json.loads(value)
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("abnormal_region_codes", mode="before")
    @classmethod
    def parse_abnormal_region_codes(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [region.strip().upper() for region in value.split(",") if region.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
