# Acceptance-gap closure

Continue the isolated Workspace candidate from 6374322; preserve frozen a834763, historical acceptance and live hosting.

1. Reproduce and fix the saved-sizing caption; assert geometry identity is unchanged.
2. Extend only the opt-in local acceptance launcher with deterministic Gemini response fixtures, a one-shot job-scoped pipeline failure, and a synthetic reconstruction failure. Exercise the existing API, worker, persistence and explicit retry. No new production routes or real provider settings.
3. Add a labeled clone of the pinned historical F3 saved state and artifact for geometry-review acceptance. Verify source hashes, preserve original evidence, remove remote task identity, and keep new-generation review gates.
4. Run focused regressions, both frontend suites/builds, original-can integration and browser caption/error checks. Package one immutable candidate with precise offline commands and remaining manual checks. No deployment change.

Gemini fixture selection applies to all uncached requests in the dedicated acceptance server; use Refresh explicitly when testing against an existing cache. A server restart deliberately re-arms its one-shot processing/provider fixture. Never restart with the fault flag when verifying normal recovery after a server restart.
