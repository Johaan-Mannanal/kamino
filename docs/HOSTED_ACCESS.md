# Hosted generation and photo handling

Kamino's hosted generation is currently team-managed. You need an access code
before submitting a reconstruction because Meshy and Gemini usage is metered.
For access questions, contact [Johaan](https://github.com/Johaan-Mannanal); a code
or response time is not guaranteed. The [complete example](COMPLETE_EXAMPLE.md)
and [local mock setup](QUICKSTART.md) work without hosted access.

## Where inputs go

Uploaded photos go to the configured Kamino backend. Real reconstruction sends
them to Meshy; requesting photo-based property assistance sends images to Gemini.
Jobs, original inputs and generated artifacts are retained in backend storage so
users can reopen and revise them. Hosted codes are shared access tiers, not
individual private accounts. Provider API keys stay on the server.

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
