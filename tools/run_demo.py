"""Isolated loopback demo API; never loads .env or external provider credentials."""

import argparse
import secrets
from pathlib import Path

import uvicorn

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("outputs/local-demo"))
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--frontend-port", type=int, default=5173)
    args = parser.parse_args()
    token = secrets.token_urlsafe(24)
    app = create_app(
        Settings(
            data_dir=args.data_dir,
            api_token=token,
            cors_origins=(
                f"http://127.0.0.1:{args.frontend_port}",
                f"http://localhost:{args.frontend_port}",
            ),
        )
    )
    print(f"Local demo application token (paste into API access): {token}", flush=True)
    print(
        "Mock reconstruction only. Assembly processing uses real MuJoCo. Provider credentials are not loaded.",
        flush=True,
    )
    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
