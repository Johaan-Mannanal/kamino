# Combined Kamino release: Windows acceptance

This is a testing candidate, not approval to replace the hosted site. The existing Railway deployment remains running. Use the full commit printed by `git rev-parse HEAD`; do not test a moving branch or apply local product patches. Record that exact SHA in the run record.

Included source: Atul's Workspace/target-review v2 delivery `2cdc3824a58b4da273d30bd61893828c6962b243`, the master's Gemini identity-hint prompt change (no search/grounding), dual-frontend Railway packaging, and isolated original-can acceptance tools. A master UI correction also separates automatic status polling from explicit geometry Refresh: polls revalidate when processing finishes or the mesh path changes; explicit Refresh retains immediate revalidation and stale-response rejection. No SO-101 trajectory changes are merged here. Physical geometry and grasp accuracy remain unaccepted.

## Fresh Windows checkout

Use a new folder; preserve existing working trees. The master supplies the full frozen SHA with this document. After fetching `codex/combined-release-20261025`, check out that SHA detached. Fetch the fixture branch without merging it:

```powershell
git fetch origin codex/combined-release-20261025 codex/can-investigation-handoff
git rev-parse HEAD
git status --short
py -3.12 -m venv .venv-acceptance
.\.venv-acceptance\Scripts\python.exe -m pip install -e ".[dev,simulation]"
npm install --global pnpm@11.25.0
node --version
pnpm --version
pnpm --dir frontend install --frozen-lockfile
pnpm --dir prototypes/kamino-ui install --frozen-lockfile
```

Node must be >=22.12.0. Preserve install logs. Do not copy `.env` or provider credentials into this checkout. The helper constructs explicit mock settings and blocks non-loopback network connections. Shell credentials are not consumed by it.

## Original raw can import

From the repository root, set a run directory tied to the exact SHA. This reads a binary Git blob without PowerShell redirection (which can corrupt binary ZIPs):

```powershell
$releaseSha = git rev-parse HEAD
$runRoot = "outputs/ui-integration/$releaseSha"
$env:PYTHONPATH = "src;."
New-Item -ItemType Directory -Force $runRoot | Out-Null
$env:KAMINO_ACCEPTANCE_ARCHIVE = "$runRoot/can-fixture.zip"
.\.venv-acceptance\Scripts\python.exe -c "import os,subprocess; from pathlib import Path; Path(os.environ['KAMINO_ACCEPTANCE_ARCHIVE']).write_bytes(subprocess.check_output(['git','show','44e3aec1346c520c272a9b39fc7f665330fcfae6:reproductions/can-investigation/can-investigation-f84d7763-20261025T030318Z.zip']))"
Get-FileHash -Algorithm SHA256 $env:KAMINO_ACCEPTANCE_ARCHIVE
.\.venv-acceptance\Scripts\python.exe -m tools.ui_acceptance_fixture --archive $env:KAMINO_ACCEPTANCE_ARCHIVE --data-dir "$runRoot/data"
```

Expected archive SHA-256: `e828bb548dae9e5828a29689f2e91c96f4069ee4c6aa8b5788a5700d2d01db6d`. The helper checks the entire manifest, copies only the original raw GLB and three original JPEGs, and prints a new job ID. No manual derivative, dimensions, selection, orientation, provider task or prior attempt is imported. `offline-can-fixture.json` records input provenance. The raw input remains photo-derived (`synthetic=false`), although the server uses an offline mock provider for any new test uploads.

Also extract a copy into a separate evidence directory and run the archive's `verify_package.py`, as required by G02. Keep the archive and historical original/manual attempts immutable. Never use the manual derivative as the selection input.

## Start the application

Terminal 1, repository root:

```powershell
$env:PYTHONPATH = "src;."
$releaseSha = git rev-parse HEAD
.\.venv-acceptance\Scripts\python.exe -m tools.ui_acceptance_server --data-dir "outputs/ui-integration/$releaseSha/data" --port 8001
```

Terminal 2, repository root:

```powershell
$env:VITE_API_BASE_URL = "http://127.0.0.1:8001"
$env:VITE_API_MODE = "live"
$env:VITE_KAMINO_ASSEMBLY_URL = "http://127.0.0.1:5173/assembly.html"
pnpm --dir prototypes/kamino-ui dev
```

Terminal 3 if inspecting assembly:

```powershell
$env:VITE_API_BASE_URL = "http://127.0.0.1:8001"
$env:VITE_API_MODE = "live"
pnpm --dir frontend dev
```

Open `http://127.0.0.1:5188/?job=JOB_ID` using the ID printed by the importer. Enter the local-only API token `ui-acceptance-only` when requested. The raw can should initially require geometry review. Inspect the three original photos and all four surfaces; select the intended can through the UI. The prior specimen inspection found Surface 3, but independently confirm visually rather than hard-coding that choice.

Use one reviewed full-extent uniform reference after orientation. The prior 100 mm height was diagnostic only. Historical 57/57/131 mm estimates are comparison values; never force all three axes or call them measurements. Save the chosen reference and record the other derived extents. Original geometry cannot be made physically accurate merely by passing numerical physics checks.

## Gemini fixture replay and errors

In another terminal with the same root, PYTHONPATH and run directory, replace JOB_ID below:

```powershell
.\.venv-acceptance\Scripts\python.exe -m tools.ui_acceptance_server --data-dir "outputs/ui-integration/$releaseSha/data" --seed-job JOB_ID
```

Request suggestions with an empty object hint and without forcing refresh. The application reads the saved positive fixture: 40/50/60 mm, 80 g and friction 0.4. These are synthetic QA estimates, not can measurements. Loading/previewing suggestions does not save properties. Exercise explicit Apply and Save; restore the can reference and properties afterward.

For unknown values:

```powershell
.\.venv-acceptance\Scripts\python.exe -m tools.ui_acceptance_server --data-dir "outputs/ui-integration/$releaseSha/data" --seed-job JOB_ID --replace-seed --unknown-seed
```

Reload/re-request the cached suggestions. Dimensions/mass/friction are null, not zeros. For a real API-level unavailable response, request suggestions with a different object hint (cache miss): the empty provider key produces `not_configured` locally, before any transport call. Do not add a real key. Unknown and unavailable checks are supported; arbitrary HTTP/quota/malformed-provider injection is not provided by this helper. Record those additional integrated scenarios BLOCKED where requested, and report existing unit/mock coverage separately.

`blocked-network.jsonl` next to the data directory records any denied non-loopback attempt. Its absence means no blocked socket attempt was recorded; combine this with server logs, explicit empty credentials, mock provider identity and request traces. Any blocked attempt requires investigation and must not be silently counted as zero attempts. No Meshy task/poll is imported.

## Required record and known boundaries

Use `windows-can-acceptance-checklist.md` and copy `windows-can-acceptance-run-record.md` into this run directory. Preserve every row, recording PASS/FAIL/BLOCKED/NOT RUN with evidence. The master has not declared the Windows pass complete.

Run the final native frontend tests/builds and relevant backend tests at this exact source. Atul's earlier Windows failures included missing fixtures and filesystem permissions; do not waive those based on Mac results. Use a complete checkout with the tracked fixture assets and record any native failure precisely.

For save-network failure, stop only this isolated backend, attempt a save, then restart it and explicitly retry. Provider/validation failure UI mocks and backend unit fixtures are supplementary; this helper does not provide an integrated failure-injection endpoint. Do not modify application code to make a checklist row pass. Record unsupported backend failure/restart scenarios BLOCKED instead of claiming mock coverage proves persistence.

Generate A, correct/save/regenerate B, re-download A and compare its hash. Download B through the browser; extract outside the checkout; load its scene using only the relocated files. Record shape review, numerical validation and native MuJoCo viewer inspection separately. Include screenshots, revisions, saved inputs, request/response traces, hashes, exact runtime and full Git SHA. Return findings to the master; do not push repairs or change the live site.

## Deployment boundary

Railway Dockerfiles and static assembly of both frontends are included. Native clean installs/builds are verified by the master, but a container build and hosted acceptance of this candidate remain pending. Python dependencies are not a frozen lock; capture installed versions. Do not run `railway up`, alter DNS, replace keys, or enable providers as part of this Windows acceptance.
