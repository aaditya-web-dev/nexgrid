
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


# Backend root directory
BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):

    # General
    PROJECT_NAME: str
    ENV: str

    # Database
    DATABASE_URL: str

    # Authentication / JWT
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    REFRESH_TOKEN_EXPIRE_DAYS: int

    # CORS
    FRONTEND_ORIGIN: str

    # AI Test Generation
    # OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = ""
    AI_PROVIDER: str = ""
    AI_MAX_TEST_CASES: int = 5

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True
    )


settings = Settings()

