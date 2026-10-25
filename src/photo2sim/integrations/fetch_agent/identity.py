"""One private, persistent agent identity. Never print the seed."""

import csv
import os
import secrets
import stat
import subprocess
from pathlib import Path

from dotenv import dotenv_values

DEFAULT_SEED_FILE = Path("artifacts/fetch-agent/identity.seed")


def settings() -> dict:
    values = dict(dotenv_values(".env"))
    values.update(os.environ)
    return values


def configured_seed(values: dict) -> str | None:
    canonical = (values.get("FETCH_AGENT_SEED") or "").strip()
    legacy = (values.get("AGENT_SEED_PHRASE") or "").strip()
    if canonical and legacy and canonical != legacy:
        raise ValueError(
            "FETCH_AGENT_SEED and legacy AGENT_SEED_PHRASE disagree; keep one identity."
        )
    return canonical or legacy or None


def secure_file(path: Path) -> None:
    if os.name == "nt":
        result = subprocess.run(
            ["whoami", "/user", "/fo", "csv", "/nh"],
            capture_output=True,
            text=True,
            check=True,
        )
        sid = next(csv.reader(result.stdout.strip().splitlines()))[-1]
        subprocess.run(
            ["icacls", str(path), "/inheritance:r", "/grant:r", f"*{sid}:(F)"],
            capture_output=True,
            check=True,
        )
    else:
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)


def load_seed(values: dict | None = None, path: Path | None = None) -> str:
    values = settings() if values is None else values
    seed = configured_seed(values)
    path = path or Path(values.get("FETCH_AGENT_SEED_FILE") or DEFAULT_SEED_FILE)
    saved = path.read_text(encoding="utf-8").strip() if path.is_file() else None
    if seed and saved and seed != saved:
        raise ValueError("Configured Fetch seed differs from the persistent private identity file.")
    seed = seed or saved
    if not seed:
        raise ValueError(
            "Initialize the private Fetch identity with python -m photo2sim.integrations.fetch_agent.identity"
        )
    if len(seed) < 32:
        raise ValueError("Fetch identity seed must contain at least 32 characters.")
    return seed


def initialize(path: Path | None = None, values: dict | None = None) -> str:
    values = settings() if values is None else values
    path = path or Path(values.get("FETCH_AGENT_SEED_FILE") or DEFAULT_SEED_FILE)
    if path.exists():
        secure_file(path)
        return load_seed(values, path)
    seed = configured_seed(values) or secrets.token_urlsafe(48)
    if len(seed) < 32:
        raise ValueError("Fetch identity seed must contain at least 32 characters.")
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        secure_file(path)
        with os.fdopen(descriptor, "w", encoding="utf-8") as private:
            descriptor = -1
            private.write(seed + "\n")
    finally:
        if descriptor != -1:
            os.close(descriptor)
    return seed


if __name__ == "__main__":
    from uagents_core.identity import Identity

    identity = Identity.from_seed(initialize(), 0)
    print("Private persistent identity ready. Public address:", identity.address)
