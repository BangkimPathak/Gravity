import os
from pathlib import Path
from typing import List
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Locate base and .env paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"

# Explicitly load .env file into environment
if ENV_FILE.exists():
    load_dotenv(dotenv_path=ENV_FILE, override=True)
else:
    load_dotenv(override=True)

UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseSettings):
    PROJECT_NAME: str = "Gravity"
    API_V1_STR: str = "/api/v1"
    
    # SMTP Email Configuration (for OTP codes)
    SENDER_EMAIL: str = os.getenv("SENDER_EMAIL", "")
    SENDER_APP_PASSWORD: str = os.getenv("SENDER_APP_PASSWORD", "")
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    
    # Database Settings
    DB_HOST: str = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT: str = os.getenv("DB_PORT", "3306")
    DB_USER: str = os.getenv("DB_USER", "root")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "Bangkim")
    DB_NAME: str = os.getenv("DB_NAME", "gravity")
    
    # Database URL
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        f"sqlite+aiosqlite:///{BASE_DIR}/gravity.db"
    )
    
    # JWT & Cookie Session
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "gravity_super_secret_jwt_key_2026")
    SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "gravity_super_secret_jwt_key_2026")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    COOKIE_NAME: str = os.getenv("COOKIE_NAME", "auth_token")
    COOKIE_EXPIRATION_MINUTES: int = int(os.getenv("COOKIE_EXPIRATION_MINUTES", "60"))
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("COOKIE_EXPIRATION_MINUTES", "60"))
    
    # Redis Pub/Sub Configuration
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    USE_REDIS: bool = os.getenv("USE_REDIS", "false").lower() in ("true", "1", "yes")
    
    # CORS
    CORS_ORIGINS: List[str] = ["*"]
    
    # Uploads
    UPLOAD_FOLDER: str = str(UPLOAD_DIR)
    MAX_UPLOAD_SIZE_MB: int = 25

    model_config = SettingsConfigDict(
        case_sensitive=False,
        env_file=str(ENV_FILE),
        extra="ignore"
    )

settings = Settings()
