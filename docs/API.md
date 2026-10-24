# Shared contract v1

Authoritative Python models: `src/photo2sim/contracts.py`. Backend owns this file; propose coordinated changes rather than creating parallel schemas. A synthetic response fixture is at `examples/api/job-awaiting-properties.json`; its paths/ID are illustrative, not a live job.

## HTTP interface

- `GET /api/health`: service status and configured reconstruction provider.
- `POST /api/jobs`: multipart field **`images`**, repeated for 1–4 JPEG/PNG/WebP images, at most 10 MiB and 25 megapixels each. Returns **202** and `JobRecord`.
- `GET /api/jobs/{id}`: returns `JobRecord`; poll while reconstruction runs.
- `PATCH /api/jobs/{id}/properties`: JSON `AssetProperties`; accepted only at `awaiting_properties`. Saves confirmed inputs. It does not yet launch preparation or simulation.
- `GET /api/jobs/{id}/files/{path}`: job-relative artifact download, e.g. `reconstruction/mesh.glb` or `uploads/00.png`.
- `/docs` and `/openapi.json`: generated API documentation once the backend starts.

State sequence: `queued → reconstructing → awaiting_properties → preparing → validating → completed`; failures use `failed` and `{code, message}`. The initial backend implements reconstruction and property persistence only. `progress` describes reconstruction, not total pipeline completion. A 100% reconstruction job can still await properties.

The provider is configured server-side (`mock` by default). Never accept API keys or arbitrary provider download URLs from the browser. Mock jobs have `synthetic: true`; they produce a known cube and make no claim of photo reconstruction. CORS for local frontend development permits `http://localhost:5173` and `http://127.0.0.1:5173`.

`JobRecord` contains `schema_version`, `id`, `status`, `provider`, `synthetic`, timestamps, `progress`, `source_images`, `provider_task_id`, `mesh_path`, `properties`, `asset`, `export_path`, and `error`. Nullable fields are initially null. Paths in responses are relative to that job's artifact directory, never Windows/Mac absolute paths. Missing jobs/files return 404, invalid properties return 422, and wrong-stage updates return 409.

## Property input

```json
{
  "dimensions_m": {"x": 0.04, "y": 0.05, "z": 0.06, "source": "measured"},
  "mass_kg": {"value": 0.08, "source": "user_supplied"},
  "sliding_friction": null
}
```

Dimensions are **full extents**, in metres, after mesh orientation. Mass is in kilograms. Dimensions/mass must be positive and finite. Sliding friction is a nonnegative finite coefficient for the contacting surface pair; null means unknown. Source values: `measured`, `user_supplied`, `sourced`, `estimated`. Each property record permits a `note`. AI suggestions remain `estimated` until an operator supplies/records evidence.

## Geometry boundary — Srijan

Implement in `src/photo2sim/assets/prepare.py`:

```python
def prepare_asset(
    mesh_path: Path, output_dir: Path, properties: AssetProperties
) -> AssetRecord: ...
```

Input is a local reconstructed OBJ or GLB. Normalize orientation explicitly, centre its bounding box at the origin, scale to the confirmed full extents, and copy/export a self-contained mesh into `output_dir`. Return an `AssetRecord` with job-independent `asset_id`, relative `visual_mesh`, unchanged property provenance, a `collision` record, and notes explaining geometry assumptions/distortion. Start with `collision={"kind":"box"}`; a convex collision uses `{"kind":"convex_mesh","mesh_path":"meshes/collision.obj"}`. Box collision is centred at the origin and uses the property dimensions. Export the visual mesh in metres with no remaining scaling transform. Preserve input files. Do not guess missing dimensions or mass. The caller propagates the original job's synthetic flag to the asset; preparation cannot infer whether a generated mesh came from real photos.

## Simulation boundary — Yash

Future integration target in `src/photo2sim/simulation/export.py`:

```python
def export_asset(asset: AssetRecord, asset_dir: Path, output_dir: Path) -> Path: ...
```

Read relative mesh paths from `asset_dir`, build a portable scene bundle in `output_dir`, and return its `scene.xml` path. Use the confirmed properties. Keep simulation assumptions and actual validation results in metadata/report files. Do not edit the shared contracts without coordination. This interface follows the standalone Windows baseline; it does not replace that initial task.

## Frontend boundary — Atul

Own `frontend/`, independent of the Python backend directory. Use the HTTP interface above. Set API base URL via configuration. Multipart uploads must let the browser choose the boundary. Show synthetic/provider labels, preserve property provenance, and distinguish reconstruction progress from scene completion. Polling must stop on terminal/error/awaiting-input states. Preview/download controls appear only when the corresponding artifact exists. Build mocks using the same response shape while backend/preparation/export are being integrated. Fetch integration later calls this same API; it does not duplicate reconstruction or geometry logic.
