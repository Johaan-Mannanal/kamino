import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values

from photo2sim.integrations.gemini import DEFAULT_FALLBACK_MODELS, DEFAULT_MODEL


@dataclass(frozen=True)
class Settings:
    data_dir: Path = Path("artifacts/photo2sim")
    provider: str = "mock"
    meshy_api_key: str = field(default="", repr=False)
    meshy_model: str = "meshy-6"
    gemini_api_key: str = field(default="", repr=False)
    gemini_model: str = DEFAULT_MODEL
    gemini_fallback_models: tuple[str, ...] = DEFAULT_FALLBACK_MODELS
    gemini_max_attempts: int = 2
    gemini_deadline_seconds: float = 75
    gemini_backoff_seconds: float = 0.5
    api_token: str = field(default="", repr=False)
    cors_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")
    max_image_bytes: int = 10 * 1024 * 1024
    max_asset_bytes: int = 100 * 1024 * 1024
    poll_interval: float = 3
    max_polls: int = 300

    def __post_init__(self):
        if self.provider not in ("mock", "meshy"):
            raise ValueError("PHOTO2SIM_PROVIDER must be mock or meshy")
        if self.provider == "meshy" and not self.meshy_api_key:
            raise ValueError("MESHY_API_KEY is required when PHOTO2SIM_PROVIDER=meshy")
        if self.poll_interval < 0 or self.max_polls < 1:
            raise ValueError("Polling interval/count must be nonnegative/positive")
        if (self.gemini_max_attempts < 1 or self.gemini_deadline_seconds <= 0
                or self.gemini_backoff_seconds < 0):
            raise ValueError("Invalid Gemini retry settings")

    @classmethod
    def from_env(cls, env_file: Path | None = Path(".env")):
        values = dict(dotenv_values(env_file)) if env_file is not None else {}
        values.update(os.environ)
        return cls(
            data_dir=Path(values.get("PHOTO2SIM_DATA_DIR") or "artifacts/photo2sim"),
            provider=values.get("PHOTO2SIM_PROVIDER") or "mock",
            meshy_api_key=values.get("MESHY_API_KEY") or "",
            meshy_model=values.get("MESHY_MODEL") or "meshy-6",
            gemini_api_key=values.get("GEMINI_API_KEY") or "",
            gemini_model=values.get("GEMINI_MODEL") or DEFAULT_MODEL,
            gemini_fallback_models=tuple(
                item.strip() for item in
                (values.get("GEMINI_FALLBACK_MODELS") if values.get("GEMINI_FALLBACK_MODELS") is not None
                 else ",".join(DEFAULT_FALLBACK_MODELS)).split(",")
                if item.strip()
            ),
            gemini_max_attempts=int(values.get("GEMINI_MAX_ATTEMPTS") or 2),
            gemini_deadline_seconds=float(values.get("GEMINI_DEADLINE_SECONDS") or 75),
            gemini_backoff_seconds=float(values.get("GEMINI_BACKOFF_SECONDS") or 0.5),
            api_token=values.get("PHOTO2SIM_API_TOKEN") or "",
            cors_origins=tuple(
                origin.strip().rstrip("/")
                for origin in (
                    values.get(
                        "PHOTO2SIM_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
                    )
                    or ""
                ).split(",")
                if origin.strip()
            ),
        )
