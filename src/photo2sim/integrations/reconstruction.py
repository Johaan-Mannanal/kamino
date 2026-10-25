"""Provider boundary; the default implementation is an explicitly synthetic cube."""

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol
from uuid import uuid4


@dataclass(frozen=True)
class ProviderSnapshot:
    status: Literal["pending", "running", "succeeded", "failed"]
    progress: int = 0
    mesh_url: str | None = None


class ProviderError(Exception):
    def __init__(self, code: str, message: str, *, retryable: bool = False):
        self.code = code
        self.message = message
        self.retryable = retryable
        super().__init__(message)


class ReconstructionProvider(Protocol):
    name: str

    def submit(self, images: list[Path]) -> str: ...
    def poll(self, task_id: str) -> ProviderSnapshot: ...
    def download(self, snapshot: ProviderSnapshot, output_dir: Path) -> Path: ...


class MockProvider:
    name = "mock"

    def submit(self, images: list[Path]) -> str:
        return f"mock-{uuid4()}"

    def poll(self, task_id: str) -> ProviderSnapshot:
        return ProviderSnapshot(status="succeeded", progress=100)

    def download(self, snapshot: ProviderSnapshot, output_dir: Path) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        output = output_dir / "mesh.obj"
        output.write_text(
            "# SYNTHETIC unit cube; not reconstructed from uploaded photos\n"
            "v -0.5 -0.5 -0.5\nv 0.5 -0.5 -0.5\nv 0.5 0.5 -0.5\nv -0.5 0.5 -0.5\n"
            "v -0.5 -0.5 0.5\nv 0.5 -0.5 0.5\nv 0.5 0.5 0.5\nv -0.5 0.5 0.5\n"
            "f 1 3 2\nf 1 4 3\nf 5 6 7\nf 5 7 8\n"
            "f 1 2 6\nf 1 6 5\nf 2 3 7\nf 2 7 6\n"
            "f 3 4 8\nf 3 8 7\nf 4 1 5\nf 4 5 8\n",
            encoding="utf-8",
        )
        return output
