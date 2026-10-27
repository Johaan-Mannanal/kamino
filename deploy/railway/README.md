# Railway browser access

Deploy the backend and frontend from the same accepted commit. Preserve the existing
volume, application credential, provider settings and rollback deployment images.

The backend requires `PHOTO2SIM_PUBLIC_ORIGIN` as its exact public HTTPS frontend
origin, without a path. Production uses `https://kamino.design`; the isolated release
environment uses its own Railway frontend URL. Configure this variable before deploying
the session-enabled backend. Startup fails closed if it is missing. Do not infer HTTPS
from arbitrary forwarded headers; Railway terminates TLS before the internal proxy.

`PHOTO2SIM_API_TOKEN` remains the private team access code. Enter it through **Team
sign-in**, never a provider key. The backend exchanges it for a signed 12-hour
HttpOnly, Secure, SameSite=Strict cookie scoped to `/api`. The code is not stored
in browser JavaScript, local/session storage or URLs. Refresh, new tabs and Assembly
share this browser session. Sign out clears this browser's cookie; it does not revoke
copies elsewhere. Rotating the application code invalidates all existing sessions.
This is shared team access, not individual user accounts.

Optional `PHOTO2SIM_STUDENT_CODE`, `PHOTO2SIM_JUDGE_CODE` and `PHOTO2SIM_TEAM_CODE`
add access levels. Configure them only as private server variables, never frontend
build variables or committed values. Keep `PHOTO2SIM_API_TOKEN` unchanged: it is
the signing secret and remains a valid team code. Codes must be distinct. Existing
12-hour sessions and Bearer clients remain valid. A tier code also works through
Bearer authentication, with the same limits as its browser session. Changing a
tier code revokes its sessions; changing the original token revokes every session.

The public deployment enables `PHOTO2SIM_PUBLIC_STUDENT_ACCESS=true`. This is an
explicit opt-in and defaults to `false` for self-hosters. It requires the existing
signing secret and a private `PHOTO2SIM_STUDENT_CODE`; neither goes in frontend
build variables. A read-only GET `/api/session` advertises availability. The
browser then POSTs to the same route without a code, from an allowed origin, to
receive a 30-minute student cookie. Existing judge/team sessions are preserved;
explicit invalid credentials are rejected. Both web interfaces request this
session automatically. This spends no provider credits by itself.

Workspace and Assembly requests also renew expired public browser access in place.
Only the API's explicit pre-admission access rejection is retried, once, after the
session endpoint confirms authentication. Concurrent requests share renewal; drafts
stay in the current workspace. Explicit credentials, provider errors, quota failures
and ambiguous network failures are never automatically retried. If renewal is
unavailable, Workspace keeps its draft and offers code entry without navigation.

All public visitors and student-code users share the same student allowance below.
Session renewal, a new browser, logout and server restart do not reset it. Public
student access can be disabled by setting the flag to `false` and redeploying;
already issued cookies remain valid until expiry. Rotate the student code as well
to revoke those cookies immediately. Keep the signing secret and usage database
unchanged when enabling access, so existing sessions and usage survive.

| Access | Session | Mesh submissions / 24h | Gemini requests / 24h | Simulation submissions / 24h |
| --- | --- | --- | --- | --- |
| Public student and student code | 30 minutes | 2, 5-minute cooldown | 10, 30-second cooldown | 10, 30-second cooldown |
| Judge | 6 hours | 10, 30-second cooldown | 40, 5-second cooldown | 50, 5-second cooldown |
| Team and original code | 12 hours | No quota | No quota | No quota |

Limits are shared across everyone using a tier over a rolling 24-hour window,
not per browser or sign-in. Admission is atomic and persisted in
`PHOTO2SIM_DATA_DIR/access-usage.sqlite3`; preserve this file with the job data.
Assembly creation and processing count as simulation submissions, as does rigid
processing. Cached reads, previews, manual edits and downloads do not consume these
quotas. Rejected 3xx/4xx requests refund admission except Gemini 422 responses:
those may indicate cache-write failure after inference. Gemini 422 and all 5xx
failures conservatively keep admission because a provider may already have received
work. This also counts malformed Gemini requests that return 422. A successful cached POST to
suggestions counts as a request; use GET for free cached reads. The API returns 429
with a human-readable wait time and `Retry-After`. Refresh, re-sign-in and server
restart do not reset allowance. Expiry does not cancel accepted background work:
sign in again to inspect it. Existing provider deadlines and worker safeguards still
apply to every tier. These are shared project access codes, not separate private accounts.

API scripts may continue using the existing Bearer header. Browser writes authenticated
by cookies must come from the configured public origin or explicitly allowed CORS
origins. Keep allowed origins narrow. Local HTTP sign-in is restricted to loopback;
the production origin enables Secure cookies through the internal HTTP proxy.

Check sign-in, refresh/reopen, authenticated read/write, Assembly and downloads on
the isolated environment before production. Use invalid image payloads or local mock
fixtures for upload transport checks; do not create real provider jobs merely to test
access. Preserve the exact deployed source and rollback records separately.

Frontend build variable `KAMINO_PUBLIC_ORIGIN` controls the Assembly link; it is
distinct from the backend's `PHOTO2SIM_PUBLIC_ORIGIN` and must match the environment.

For local checks against the combined production proxy, build both frontends with
`VITE_API_BASE_URL=/` and the Workspace with `VITE_API_MODE=live`, then run
`CADDY_BIN=/path/to/caddy pnpm --dir prototypes/kamino-ui test:readiness`.
The fixture checks automatic student access, judge upgrade, refresh, Assembly and
sign-out without submitting provider jobs. Backend tests separately exercise the
real signed sessions and persistent quotas.
