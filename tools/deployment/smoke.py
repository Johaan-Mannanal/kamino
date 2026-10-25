"""Check deployed access and an optional mock-only simulation workflow."""

import argparse
import json
import os
from io import BytesIO
from time import monotonic, sleep
from urllib.parse import urlsplit
from uuid import uuid4
from zipfile import ZipFile

import httpx
from dotenv import dotenv_values
from PIL import Image


def wait_for(client, job_id, status):
    deadline = monotonic() + 90
    while monotonic() < deadline:
        response = client.get(f"/api/jobs/{job_id}")
        response.raise_for_status()
        record = response.json()
        if record["status"] == status:
            return record
        if record["status"] == "failed":
            raise RuntimeError(f"Job failed: {record['error']}")
        sleep(0.25)
    raise RuntimeError(f"Job did not reach {status}")


def check_backend(client: httpx.Client, *, run_mock: bool = False) -> dict:
    response = client.get("/api/health")
    response.raise_for_status()
    provider = response.json()["provider"]
    if run_mock and provider != "mock":
        raise RuntimeError("Simulation smoke requires provider=mock; no job was created")
    missing = f"/api/jobs/{uuid4()}"
    if client.get(missing, headers={"Authorization": ""}).status_code != 401:
        raise RuntimeError("API access is not protected")
    if client.get(missing).status_code != 404:
        raise RuntimeError("Application access token was rejected")
    result = {"provider": provider, "access_checked": True}
    if not run_mock:
        return result

    image = BytesIO()
    Image.new("RGB", (8, 8), "white").save(image, format="PNG")
    response = client.post(
        "/api/jobs", files={"images": ("synthetic.png", image.getvalue(), "image/png")}
    )
    response.raise_for_status()
    job_id = response.json()["id"]
    ready = wait_for(client, job_id, "awaiting_properties")
    inventory = client.get(f"/api/jobs/{job_id}/geometry")
    inventory.raise_for_status()
    geometry = inventory.json()
    # Intentional all-parts choice for this known synthetic mock fixture only.
    reviewed = client.patch(
        f"/api/jobs/{job_id}/geometry-review",
        json={
            "source_mesh_sha256": geometry["source_mesh_sha256"],
            "island_ids": [part["id"] for part in geometry["islands"]],
            "orientation": ready["orientation"],
            "expected_input_revision": ready["input_revision"],
            "acknowledge_geometry": True,
            "review_note": "Explicit known synthetic smoke target; all fixture surfaces belong together",
        },
    )
    reviewed.raise_for_status()
    context = reviewed.json()["geometry_review"]["geometry_context_sha256"]
    saved = client.patch(
        f"/api/jobs/{job_id}/properties",
        json={
            "geometry_context_sha256": context,
            "dimensions_m": {
                "x": 0.04,
                "y": 0.05,
                "z": 0.06,
                "source": "estimated",
                "note": "Synthetic smoke fixture",
            },
            "mass_kg": {"value": 0.08, "source": "estimated", "note": "Synthetic assumed mass"},
            "sizing": {
                "mode": "independent_axes",
                "acknowledge_distortion": True,
                "reviewed_orientation": {"x_deg": 0, "y_deg": 0, "z_deg": 0},
            },
        },
    )
    saved.raise_for_status()
    started = client.post(f"/api/jobs/{job_id}/process")
    started.raise_for_status()
    job = wait_for(client, job_id, "completed")
    report = client.get(f"/api/jobs/{job_id}/files/{job['validation_path']}")
    report.raise_for_status()
    if not report.json().get("passed") or not report.json().get("portability_passed"):
        raise RuntimeError("Simulation/relocation validation failed")
    response = client.get(f"/api/jobs/{job_id}/files/{job['bundle_path']}")
    response.raise_for_status()
    with ZipFile(BytesIO(response.content)) as archive:
        if archive.testzip() is not None or "scene.xml" not in archive.namelist():
            raise RuntimeError("Export ZIP is corrupt or incomplete")
    return {
        **result,
        "job_id": job_id,
        "synthetic": job["synthetic"],
        "simulation_passed": True,
        "bundle_bytes": len(response.content),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--env-file", default=".env.deploy")
    parser.add_argument(
        "--mock", action="store_true", help="Create a synthetic job; refuses real providers"
    )
    args = parser.parse_args()
    url = urlsplit(args.base_url)
    if url.scheme != "https" and not (
        url.scheme == "http" and url.hostname in {"localhost", "127.0.0.1", "::1"}
    ):
        parser.error("Use HTTPS; HTTP is allowed only on loopback")
    values = dict(dotenv_values(args.env_file))
    values.update(os.environ)
    token = values.get("PHOTO2SIM_API_TOKEN")
    if not token:
        parser.error("Set PHOTO2SIM_API_TOKEN in the private env file or environment")
    with httpx.Client(
        base_url=args.base_url, headers={"Authorization": f"Bearer {token}"}, timeout=120
    ) as client:
        print(json.dumps(check_backend(client, run_mock=args.mock), indent=2))


if __name__ == "__main__":
    main()
