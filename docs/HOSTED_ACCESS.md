# Hosted generation and photo handling

The public site gives every visitor student access automatically. No access code
or provider key is needed. Student sessions last 30 minutes and share one rolling
24-hour allowance across all visitors: 2 mesh submissions (5 minutes apart),
10 Gemini requests (30 seconds apart), and 10 simulation submissions (30 seconds
apart). Another visitor may already have used the available allowance.

Workspace and Assembly requests renew expired public student access in place.
After the API rejects access, the browser confirms renewal and retries that
request once; drafts stay in the current workspace. Explicit credentials,
provider/quota errors and ambiguous network failures are not automatically retried.
If renewal is unavailable, Workspace keeps the draft and offers code entry.
Refresh or the upload access check can also renew a session.
Renewal does not reset usage. Saved reads and downloads do not use the
generation allowance. The server reports a wait time when a limit is reached.
Judge and team access still require a code; use **Student access** on the upload
page or **Generation access** in Assembly to enter one. Signing out clears this
browser's session; public student access resumes on refresh or the next upload
access check. Existing judge and team sessions keep their role.

For access questions, contact [Johaan](https://github.com/Johaan-Mannanal). The
[complete example](COMPLETE_EXAMPLE.md) and [local mock setup](QUICKSTART.md)
work without hosted access or a generation allowance. Self-hosted deployments
must explicitly enable public student access; it is off by default.

## Where inputs go

Uploaded photos go to the configured Kamino backend. Real reconstruction sends
them to Meshy; requesting photo-based property assistance sends images to Gemini.
Jobs, original inputs and generated artifacts are retained in backend storage so
users can reopen and revise them. Hosted access uses shared tiers, not individual
private accounts. Student access is public; a job ID is not a private account or
ownership check. Provider API keys and shared access codes stay on the server.

The service does not currently publish a guaranteed retention period or provide
a self-service deletion interface. For a removal request, contact the maintainer
with the job ID through an agreed private channel. Do not put access codes,
private photos or sensitive job contents in a public issue. The maintainer must
confirm what was removed; deletion from provider systems is governed separately
by those providers' policies. This page makes no automatic-deletion promise.

## Offline paths

The public procedural mug uses bundled demo assets; it does not reconstruct the
demo photos. The complete hinged-panel download uses synthetic meshes and needs
no uploads. The isolated local launcher ignores `.env` and provider credentials.
Self-hosters control their own storage and provider configuration.
