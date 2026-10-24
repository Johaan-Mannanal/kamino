# Saved orientation before preparation

The corrected charger previously required an offline mesh rotation. The backend
now accepts and persists that choice through PATCH `/api/jobs/{id}/orientation`
and applies it to the unchanged raw mesh before centring and dimensional scaling.
The public payload is `{"x_deg":90,"y_deg":0,"z_deg":0}` for this charger.
Rotations are fixed-axis, right-handed X then Y then Z. No orientation is inferred.

Old jobs and API consumers default to zero rotation. Orientation is recorded in
the job and exported AssetRecord. Edits are allowed while awaiting properties
or after eligible simulation failures, use a conditional state write, clear
current result pointers and retain old files. Processing/completed jobs reject
edits. Retry starts from raw geometry, so rotation does not accumulate.

Verification: all 11 new tests failed before implementation and passed after it;
full Python suite 186 passed, one optional uagents_core skip and the existing
Starlette/httpx deprecation warning. Tests cover rotation order before scaling,
source preservation, persistence/restart, export metadata, invalid inputs,
edit/process races and failure recovery.

Independent read-only review found no actionable issues and independently ran
63 focused orientation, geometry, API and pipeline tests successfully. Ruff
lint/format and dependency checks passed.

The cached real charger completed through API PATCH/PATCH/POST, produced a
downloadable ZIP, and passed original/relocated simulation validation. Its mesh
matches the hand-oriented candidate within 1e-8 m, with unchanged raw SHA256 and
zero provider calls. Evidence: `examples/simulation/apple-20w-charger-cleaned/api-acceptance/`.

Frontend files were not changed while Atul works. No message was sent to him.
His remaining integration is the orientation review/control using `docs/API.md`.
Yash's Windows acceptance remains separate. Vultr remains deferred.
