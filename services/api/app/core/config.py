"""Environment-based configuration (pydantic-settings)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]          # services/api
REPO_DIR = API_DIR.parents[1]                          # repo root
DATA_DIR = REPO_DIR / "data"
MODELS_DIR = REPO_DIR / "ml" / "models"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(API_DIR / ".env"), extra="ignore")

    database_url: str = f"sqlite:///{API_DIR / 'janavaani.db'}"
    supabase_url: str = ""
    supabase_jwt_secret: str = ""          # legacy HS256 Supabase projects
    app_jwt_secret: str = "dev-only-change-me-janavaani-secret-key"
    gemini_api_key: str = ""
    gemini_model_main: str = "gemini-flash-latest"
    gemini_model_lite: str = "gemini-flash-lite-latest"
    groq_api_key: str = ""
    groq_model_main: str = "llama-3.3-70b-versatile"
    groq_model_small: str = "llama-3.1-8b-instant"
    groq_whisper_model: str = "whisper-large-v3-turbo"
    embedding_model: str = "intfloat/multilingual-e5-small"
    use_embeddings: bool = True            # try sentence-transformers; fall back to lexical
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    demo_mode: bool = True
    force_fail_gemini: bool = False
    force_fail_groq: bool = False
    ai_timeout_s: float = 12.0
    upload_dir: str = str(API_DIR / "uploads")
    ai_cache_dir: str = str(API_DIR / ".ai_cache")
    enable_scheduler: bool = True

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
