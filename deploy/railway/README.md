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
