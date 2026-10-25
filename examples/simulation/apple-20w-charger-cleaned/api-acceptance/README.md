# Saved-orientation API acceptance

The cached real Meshy job `14ec98fd-cda0-4b0c-915f-a70e0805dc66` was completed
through FastAPI's in-process HTTP test client using the real preparation,
export and MuJoCo validation code. This is backend acceptance, not a browser
or deployed-server test. No provider calls were permitted or made.

Sequence:

1. PATCH the existing estimated properties to `/api/jobs/{id}/properties`.
2. PATCH `{"x_deg":90,"y_deg":0,"z_deg":0}` to `/api/jobs/{id}/orientation`.
3. POST `/api/jobs/{id}/process`; poll to `completed`.
4. Download validation and ZIP via the job file endpoint.

The ZIP's exported vertices match the previously hand-oriented candidate within
1e-8 m. Raw GLB SHA256 remains unchanged. Saved rotation is present in the job,
prepared asset and ZIP's `asset.json`. Original and relocated physics checks
passed. Exact evidence is in `acceptance.json`, `job.json` and
`validation-report.json`. Runtime remains Intel Mac MuJoCo 3.3.7.

`simulation.zip` is the actual API download. Yash can validate and view this
archive using the parent README's commands with this ZIP path substituted.
Windows/native viewer acceptance remains separate. Box collision, approximate
inertia, estimated dimensions/mass and unknown friction remain unchanged.

Atul's frontend still needs an orientation control. Save all three angles before
processing and display the saved value from GET job. Never rotate the already
prepared simulation mesh again. The authoritative rotation order and error
handling are documented in `docs/API.md`.
