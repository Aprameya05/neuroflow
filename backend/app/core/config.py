from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://neuroflow:neuroflow@localhost/neuroflow"
    REDIS_URL: str = "redis://localhost:6379"
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]
    SECRET_KEY: str = "change-in-production"
    MODEL_PATH: str = "app/ml/models/cognitive_load_lstm.onnx"
    SIGNAL_WINDOW_MS: int = 3000
    SIGNAL_SAMPLE_RATE_MS: int = 100

    class Config:
        env_file = ".env"


settings = Settings()
