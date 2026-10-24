# Backend Pipeline Implementation Plan

> **For agentic workers:** Execute inline in this chat using the agreed project scope and test-first implementation.

**Goal:** Publish shared contracts and deliver persistent photo-upload/reconstruction jobs that teammates can build against.

**Architecture:** FastAPI exposes typed job endpoints. SQLite persists records; job-relative local files preserve uploads and downloaded meshes. A bounded in-process executor runs either an explicitly synthetic mock provider or the Meshy adapter. Asset preparation and export stay at documented integration boundaries until teammate implementations arrive.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic, SQLite, HTTPX, Pillow, pytest.

**Spec:** `docs/PROJECT.md` and `docs/API.md`; user authorized implementation here and separate teammate branches.

## Global constraints

- Preserve other branches, camera work, and the Windows LeRobot environment.
- Dimensions use metres/full extents; mass uses kilograms; properties retain provenance.
- Default to mock; real Meshy execution requires an explicit provider setting and key.
- Scope: shared contracts, upload/jobs/properties API, reconstruction adapters, documentation and handoffs. No premature integration of unfinished geometry/export/UI work.

## Review focus

- Malformed/oversized uploads produce no queued job.
- Job IDs and file paths cannot escape the artifact directory.
- Restart recovery never silently resubmits a possibly paid generation.
- Provider failures do not expose credentials or discard saved uploads/task IDs.
- Unknown properties and synthetic data remain visibly identified.

### Task 1: Shared contracts and teammate handoffs

Files: `src/photo2sim/contracts.py`, `tests/test_contracts.py`, `docs/API.md`, `docs/handoffs/`.

Produces: AssetProperties, AssetRecord, JobRecord and the exact boundaries in API.md.

- [x] Write and run failing tests for property validation, portable paths, and provenance.
- [x] Implement models and publish contracts plus separate teammate instructions on the backend branch.
- [x] Run contract tests, lint, formatting; commit and push.

### Task 2: Persistent mock backend

Files: `src/photo2sim/api/{app,config,store,worker}.py`, `src/photo2sim/integrations/reconstruction.py`, `tests/test_api.py`.

Consumes: shared models. Produces: create_app(settings, provider), HTTP routes in API.md, SQLite job records and preserved artifacts.

- [x] Write and run failing tests covering upload→mesh→properties, invalid inputs, file confinement, provider failure, and restart persistence.
- [x] Implement bounded worker execution and safe recovery without automatic paid resubmission.
- [x] Run the suite and commit the mock backend.

### Task 3: Meshy adapter and runnable handoff

Files: `src/photo2sim/integrations/meshy.py`, `tests/test_meshy.py`, README, configuration and CI.

Consumes: provider submit/poll/download boundary. Produces: saved self-contained GLB, persistent task ID, actionable sanitized errors.

- [x] Write failing HTTP-transport tests using the official Meshy multi-image endpoint/payload.
- [x] Implement bounded polling, anonymous asset download, and preservation on failure.
- [x] Run all tests, lint, format, package install, and a local HTTP smoke test.
- [x] Publish the backend branch; report live provider execution separately from transport tests.

## Execution evidence

Task 1 published in `641084f` with 12 passing contract tests. Tasks 2/3 passed the full 44-test suite, lint, format, dependency consistency, and a real local HTTP smoke test. Live Meshy generation remains unverified. Feature branch publication and GitHub Python 3.12 checks are verified separately in the final handoff.

Independent read-only final review of `ad3b04e..1ad3af9`: no material findings. GitHub Python 3.12 CI passed in run `40056221500`. No runtime changes followed the review; subsequent changes clarify documentation and record evidence.
