import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path = Path("artifacts/photo2sim")
    provider: str = "mock"
    meshy_api_key: str = field(default="", repr=False)
    meshy_model: str = "meshy-6"
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

    @classmethod
    def from_env(cls):
        return cls(
            data_dir=Path(os.environ.get("PHOTO2SIM_DATA_DIR", "artifacts/photo2sim")),
            provider=os.environ.get("PHOTO2SIM_PROVIDER", "mock"),
            meshy_api_key=os.environ.get("MESHY_API_KEY", ""),
            meshy_model=os.environ.get("MESHY_MODEL", "meshy-6"),
        )
