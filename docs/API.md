# Shared contract v1

Authoritative Python models: `src/photo2sim/contracts.py`. Backend owns this file; propose coordinated changes rather than creating parallel schemas. A synthetic response fixture is at `examples/api/job-awaiting-properties.json`; its paths/ID are illustrative, not a live job.

## HTTP interface

- `GET /api/health`: service status and configured reconstruction provider.
- `POST /api/jobs`: multipart field **`images`**, repeated for 1–4 JPEG/PNG/WebP images, at most 10 MiB and 25 megapixels each. Returns **202** and `JobRecord`.
- `GET /api/jobs/{id}`: returns `JobRecord`; poll while reconstruction runs.
- `POST /api/jobs/{id}/suggestions`: optional JSON `{object_hint, refresh}`; asks Gemini for unverified `PropertySuggestions` from the saved photos. Same hint/model uses cache unless `refresh: true`. No automatic calls, confirmation, processing or property changes.
- `GET /api/jobs/{id}/suggestions`: returns saved suggestions, or 404 when absent. Survives server restart.
- `PATCH /api/jobs/{id}/properties`: JSON `AssetProperties`; accepted at `awaiting_properties` or after a simulation-stage failure. Saving corrected properties returns to `awaiting_properties` and clears current result pointers while retaining prior attempt files. Saves confirmed inputs. Processing starts with a separate explicit request.
- `PATCH /api/jobs/{id}/orientation`: JSON `Orientation`, for example `{"x_deg":90,"y_deg":0,"z_deg":0}`. Saves rotation before dimension scaling; accepted at the same stages as property edits. Returns the updated job. It clears current result pointers and retains old attempt files; it never submits reconstruction or starts processing.
- `POST /api/jobs/{id}/process`: no body. Requires a reconstructed mesh and saved properties. Returns **202** with status `preparing`, then runs preparation, export and headless validation asynchronously. Duplicate/running/completed requests return **409**. Failed simulation attempts can be retried with this endpoint; existing attempt files are retained. Reconstruction failures require separate diagnosis, not this retry.
- `GET /api/jobs/{id}/files/{path}`: job-relative artifact download, e.g. `reconstruction/mesh.glb` or `uploads/00.png`.
- `/docs` and `/openapi.json`: generated API documentation once the backend starts.

Phone JPEGs identified as MPO are accepted as JPEG uploads with their original bytes preserved. A provenance-labeled property example for the first real object is at `examples/api/apple-20w-estimated-properties.json`; these are reference-based estimates, not measurements.

State sequence: `queued → reconstructing → awaiting_properties → preparing → validating → completed`; failures use `failed` and `{code, message}`. Completion requires passing original and relocated scene validation and successful ZIP packaging. `progress` describes reconstruction, not total pipeline completion. A 100% reconstruction job can still await properties.

The provider is configured server-side (`mock` by default). Never accept API keys or arbitrary provider download URLs from the browser. Mock jobs have `synthetic: true`; they produce a known cube and make no claim of photo reconstruction. CORS defaults to `http://localhost:5173` and `http://127.0.0.1:5173`; override exact origins with comma-separated `PHOTO2SIM_CORS_ORIGINS`. Authorization and Content-Type headers are permitted.

`JobRecord` contains `schema_version`, `id`, `status`, `provider`, `synthetic`, timestamps, `progress`, `source_images`, `provider_task_id`, `mesh_path`, `properties`, `orientation`, `asset`, `export_path`, `validation_path`, `bundle_path`, and `error`. Nullable fields are initially null; orientation defaults to zero rotation. Top-level paths in responses are relative to that job's artifact directory, never Windows/Mac absolute paths. Missing jobs/files return 404, invalid properties or orientation return 422, and wrong-stage updates return 409.

After processing, `export_path` names `attempts/{attempt}/bundle/scene.xml`, `validation_path` names its `validation-report.json`, and `bundle_path` names `attempts/{attempt}/simulation.zip`. Download each using `/api/jobs/{id}/files/{path}`. The ZIP contains `scene.xml` at its root with relative meshes, `asset.json`, `simulation.json` and the actual validation report. Failed validation can expose its diagnostic scene/report but never sets `bundle_path`. Only show a successful download action for `status == completed` and non-null `bundle_path`.

`asset.visual_mesh` is **bundle-relative**, unlike top-level job paths. Once `export_path` exists, its visual mesh's job-relative path is `dirname(export_path) + '/' + asset.visual_mesh`. Reconstruction preview still uses `mesh_path`. Early preparation failures may have `asset` set without an export; do not infer a downloadable mesh from `asset` alone.

Restarting while preparing/validating marks the job `failed` with `processing_interrupted`; retry `/process` to use the cached reconstruction in a new attempt. This never submits another paid generation. Processing errors are sanitized and retain saved artifacts. Unexpected validator exceptions still produce a safe failure report. A failed simulation can be retried directly or have its properties corrected with PATCH first; reconstruction failures cannot use this recovery path. Without the simulation extra, processing fails with `simulation_unavailable` and installation instructions.

## Optional Gemini suggestions

POST with `{"object_hint": "Apple USB-C adapter"}` or no body. The response has nullable `dimensions_m`, `mass_kg`, `sliding_friction`, plus `clarifying_questions` and `notes`. Property shapes match the existing contract, but every suggested property remains `source: estimated` with an unverified note. Null means unknown; display the questions and allow manual input. The real charger response is at `examples/api/apple-20w-gemini-suggestions.json`.

The endpoint sends EXIF-corrected RGB JPEG copies, at most 1024 pixels on the longest side, from the job's saved source images. Originals are preserved. Suggestions, requested model, actual responding model, fallback flag, hint and timestamp are cached under `suggestions/gemini.json`, separately from confirmed properties. Cache matching uses the requested model and configured fallback list, so a successful fallback is reused without calling the primary again. A successful refresh replaces this cache; a failed refresh preserves it. Only one uncached Gemini request runs at once per server; busy requests return 429 with Retry-After. Missing credentials, quota/provider/malformed-response failures return 503 and leave manual entry available; invalid local images return 422. Missing jobs return 404.

Applying a suggestion requires an explicit PATCH to `/properties`; the server does not do this automatically. A repeat GET or cached POST makes no new provider request. A changed hint/model or explicit refresh can make another request.

## Deployment access

When `PHOTO2SIM_API_TOKEN` is set, every `/api/` route except `/api/health` requires `Authorization: Bearer <application-token>`. Missing/wrong credentials return 401 with WWW-Authenticate: Bearer. Docs/OpenAPI remain readable and Swagger provides an Authorize control. OPTIONS preflight does not require a token. Local development with a blank token remains unchanged; Compose requires one for public deployment.

This application token is distinct from Gemini/Meshy/Agentverse/Vultr keys. Never put provider keys in browser code. Team-demo clients need the app token through private configuration, user entry or a server-side proxy; do not bundle it into a public frontend. File downloads also require authorization: fetch them with headers and create a local Blob download, rather than relying on an unauthenticated anchor URL.

## Property input

### Orientation before dimensions

`JobRecord.orientation` and exported `AssetRecord.orientation` contain `x_deg`,
`y_deg`, `z_deg`. Each is a finite JSON number between -180 and 180. Missing
angles default to zero; `{}` resets all angles. The endpoint replaces the full
orientation, so clients should send all three angles when preserving other axes.
Existing saved records without orientation load with zero rotation.

Rotations are active, right-handed, about **fixed X, then fixed Y, then fixed Z**
axes: `Rz @ Ry @ Rx` on column vectors. They apply after GLB scene transforms are
baked, before bounding-box centring and per-axis scaling. Dimensions describe
the final axes. For the reviewed cleaned charger, use `x_deg: 90`: raw +Y pins
become +Z, raw +Z becomes -Y, and raw X stays X. This is a manually selected
setting for this asset, not a rule applied to all GLBs.

Save properties and orientation, await both responses, then POST `/process`.
GET job responses expose the saved orientation. A retry always starts from the
unchanged raw reconstruction; rotations do not accumulate. Edits during active
processing or after completion return 409. On eligible simulation failures,
correct orientation and retry with the cached reconstruction. Previous artifact
files remain available, while current job result pointers are cleared.

The raw GLB preview stays in the provider frame. A frontend preview applying
rotation must use these fixed-axis semantics (and avoid applying the rotation
again to the already-prepared simulation mesh). The frontend orientation control
is not implemented by this backend change; no automatic orientation review or
visual confirmation is claimed. Default zero preserves previous clients.

```json
{
  "dimensions_m": {"x": 0.04, "y": 0.05, "z": 0.06, "source": "measured"},
  "mass_kg": {"value": 0.08, "source": "user_supplied"},
  "sliding_friction": null
}
```

Dimensions are **full extents**, in metres, after mesh orientation. Mass is in kilograms. Dimensions/mass must be positive and finite. Sliding friction is a nonnegative finite coefficient for the contacting surface pair; null means unknown. Source values: `measured`, `user_supplied`, `sourced`, `estimated`. Each property record permits a `note`. AI suggestions remain `estimated` until an operator supplies/records evidence.

## Geometry boundary — Srijan

Implemented in `src/photo2sim/assets/prepare.py`:

```python
def prepare_asset(
    mesh_path: Path,
    output_dir: Path,
    properties: AssetProperties,
    *,
    orientation: Orientation | None = None,
) -> AssetRecord: ...
```

Input is a local reconstructed OBJ or GLB. Explicit orientation is applied before centring and scaling; omission preserves input axes. It does not infer upright orientation or automatically convert glTF +Y-up to MuJoCo +Z-up. It centres the bounding box, independently scales each axis to the supplied full extents, and warns about distortion. It returns a self-contained mesh, saved orientation, unchanged property provenance and box collision metadata. The orchestrator propagates `job.synthetic` and preserves textured preparation while supplying a separate geometry-only copy to the first simulation exporter. Source geometry is preserved; dimensions and mass are never inferred during preparation.

## Simulation boundary — Yash

Implemented in `src/photo2sim/simulation/export.py`:

```python
def export_asset(asset: AssetRecord, asset_dir: Path, output_dir: Path) -> Path: ...
```

Read relative mesh paths from `asset_dir`, build a portable scene bundle in `output_dir`, and return its `scene.xml` path. Use the confirmed properties. Keep simulation assumptions and actual validation results in metadata/report files. Do not edit the shared contracts without coordination. This interface follows the standalone Windows baseline; it does not replace that initial task.

## Frontend boundary — Atul

Own `frontend/`, independent of the Python backend directory. Use the HTTP interface above. Set API base URL via configuration. Multipart uploads must let the browser choose the boundary. Show synthetic/provider labels, preserve property provenance, and distinguish reconstruction progress from scene completion. Polling must stop on terminal/error/awaiting-input states. Preview/download controls appear only when the corresponding artifact exists. Build mocks using the same response shape while backend/preparation/export are being integrated. Fetch integration later calls this same API; it does not duplicate reconstruction or geometry logic.

## Articulated assets

The new [assembly format](ASSEMBLIES.md) is a separate local library/CLI. These
HTTP endpoints still process rigid AssetRecord v1 only; do not POST assembly JSON
to them. Guided assembly UI/API integration is a later milestone.
