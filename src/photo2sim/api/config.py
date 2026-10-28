import math
import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

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
    student_code: str = field(default="", repr=False)
    public_student_access: bool = False
    judge_code: str = field(default="", repr=False)
    team_code: str = field(default="", repr=False)
    public_origin: str = ""
    cors_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")
    max_image_bytes: int = 10 * 1024 * 1024
    max_asset_bytes: int = 100 * 1024 * 1024
    storage_max_total_bytes: int = 3 * 1024**3
    storage_max_job_bytes: int = 512 * 1024**2
    storage_min_free_bytes: int = 256 * 1024**2
    poll_interval: float = 3
    max_polls: int = 300

    def __post_init__(self):
        if self.public_student_access and not (self.api_token and self.student_code):
            raise ValueError("Public student access requires a signing secret and student code")
        codes = [self.student_code, self.judge_code, self.team_code]
        if any(codes) and not self.api_token:
            raise ValueError("Tier codes require PHOTO2SIM_API_TOKEN as the signing secret")
        configured = [value for value in [self.api_token, *codes] if value]
        if len(configured) != len(set(configured)) or any(v != v.strip() for v in configured):
            raise ValueError("Access codes must be distinct and have no surrounding whitespace")
        if self.public_origin:
            origin = urlsplit(self.public_origin)
            if (
                origin.scheme != "https"
                or not origin.hostname
                or origin.path
                or origin.query
                or origin.fragment
                or origin.username
                or origin.password
            ):
                raise ValueError("PHOTO2SIM_PUBLIC_ORIGIN must be an HTTPS origin without a path")
            host = f"[{origin.hostname}]" if ":" in origin.hostname else origin.hostname
            port = f":{origin.port}" if origin.port not in (None, 443) else ""
            object.__setattr__(self, "public_origin", f"https://{host}{port}")
        if self.provider not in ("mock", "meshy"):
            raise ValueError("PHOTO2SIM_PROVIDER must be mock or meshy")
        if any(
            isinstance(value, bool) or value < 0
            for value in (
                self.storage_max_total_bytes,
                self.storage_max_job_bytes,
                self.storage_min_free_bytes,
            )
        ):
            raise ValueError("Storage limits must be nonnegative byte counts")
        if self.provider == "meshy" and not self.meshy_api_key:
            raise ValueError("MESHY_API_KEY is required when PHOTO2SIM_PROVIDER=meshy")
        if self.poll_interval < 0 or self.max_polls < 1:
            raise ValueError("Polling interval/count must be nonnegative/positive")
        if (
            self.gemini_max_attempts < 1
            or not math.isfinite(self.gemini_deadline_seconds)
            or self.gemini_deadline_seconds <= 0
            or not math.isfinite(self.gemini_backoff_seconds)
            or self.gemini_backoff_seconds < 0
        ):
            raise ValueError("Invalid Gemini retry settings")

    @classmethod
    def from_env(cls, env_file: Path | None = Path(".env")):
        values = dict(dotenv_values(env_file)) if env_file is not None else {}
        values.update(os.environ)
        public_student_access = (values.get("PHOTO2SIM_PUBLIC_STUDENT_ACCESS") or "false").lower()
        if public_student_access not in {"true", "false"}:
            raise ValueError("PHOTO2SIM_PUBLIC_STUDENT_ACCESS must be true or false")
        return cls(
            data_dir=Path(values.get("PHOTO2SIM_DATA_DIR") or "artifacts/photo2sim"),
            provider=values.get("PHOTO2SIM_PROVIDER") or "mock",
            meshy_api_key=values.get("MESHY_API_KEY") or "",
            meshy_model=values.get("MESHY_MODEL") or "meshy-6",
            gemini_api_key=values.get("GEMINI_API_KEY") or "",
            gemini_model=values.get("GEMINI_MODEL") or DEFAULT_MODEL,
            gemini_fallback_models=tuple(
                item.strip()
                for item in (
                    values.get("GEMINI_FALLBACK_MODELS")
                    if values.get("GEMINI_FALLBACK_MODELS") is not None
                    else ",".join(DEFAULT_FALLBACK_MODELS)
                ).split(",")
                if item.strip()
            ),
            gemini_max_attempts=int(values.get("GEMINI_MAX_ATTEMPTS") or 2),
            gemini_deadline_seconds=float(values.get("GEMINI_DEADLINE_SECONDS") or 75),
            gemini_backoff_seconds=float(values.get("GEMINI_BACKOFF_SECONDS") or 0.5),
            api_token=values.get("PHOTO2SIM_API_TOKEN") or "",
            student_code=values.get("PHOTO2SIM_STUDENT_CODE") or "",
            public_student_access=public_student_access == "true",
            storage_max_total_bytes=int(
                values.get("PHOTO2SIM_STORAGE_MAX_TOTAL_BYTES") or 3 * 1024**3
            ),
            storage_max_job_bytes=int(
                values.get("PHOTO2SIM_STORAGE_MAX_JOB_BYTES") or 512 * 1024**2
            ),
            storage_min_free_bytes=int(
                values.get("PHOTO2SIM_STORAGE_MIN_FREE_BYTES") or 256 * 1024**2
            ),
            judge_code=values.get("PHOTO2SIM_JUDGE_CODE") or "",
            team_code=values.get("PHOTO2SIM_TEAM_CODE") or "",
            public_origin=(values.get("PHOTO2SIM_PUBLIC_ORIGIN") or "").rstrip("/"),
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
