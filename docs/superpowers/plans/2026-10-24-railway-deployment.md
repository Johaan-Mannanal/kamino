# Kamino Railway deployment test

Goal: test the published 724867c checkpoint on Railway without modifying concurrent can/UI work. This is not final integrated acceptance.

Architecture: two services; Caddy serves the Vite build and proxies /api to a private Python backend. A volume preserves job data. Mock provider only for this test. No provider credentials in browser assets.

Authorized budget: up to $10 additional Railway test usage, not indefinite hosting. Bright Data public-specification test has a separate $1 ceiling.

1. Add isolated packaging and startup validation; preserve existing product files.
2. Build frontend and verify Caddy routes plus authenticated mock upload/process/download locally.
3. Configure Railway services, bounded resources, persistent volume and mock settings; deploy this branch.
4. Verify deployed source, health, authentication, assembly page, mock export and persistence. Configure custom domain only after a healthy endpoint exists.
5. Record results and limitations; final can/UI integrated source requires separate acceptance.

No Docker engine is installed on this Mac. Local frontend/proxy tests are distinct from Railway container-build verification.
