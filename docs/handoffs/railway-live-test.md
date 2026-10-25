# Kamino Railway test — 2026-10-24 Pacific

Status: Railway HTTPS preview and authenticated mock workflows passed. Final can/UI acceptance remains separate. Custom-domain DNS and trusted HTTPS passed.

Preview: https://kamino.design
Railway fallback: https://kamino-app-production.up.railway.app
Project: https://railway.com/project/bd72545f-1366-49f1-9592-349121a32413

## Exact source and infrastructure

Branch: codex/railway-deployment. Packaging tip aba64b93c76314ec342092befb3a66fca5164729, based on published checkpoint 724867cea2497a571002e6d0d9ac46d64b604c6f. No current can-selection/Figma changes were merged. Product source files were not modified by this packaging work.

Frontend source 83cffa845bdf26125ed8deae5ba90eb372401929; deployment b34be98a-60fb-4faf-bc83-a980efb6e9aa; service 3c12d37c-006a-4d01-a9da-8512a99bd599. Backend source aba64b93c76314ec342092befb3a66fca5164729; deployment 523fa54c-a60a-4482-aa55-c8ef9e26c429; service 76383506-2583-4cf2-b3ef-7075f2abb7c7. Frontend inputs are unchanged between those sources. Both were uploaded as clean archives of selected committed build inputs; no .env, node_modules, captures or historical job archives were uploaded.

Production environment 189ec101-c856-4c1c-929a-023e118aacc1. One replica each, US West. Backend ceiling 1 CPU/2 GB; frontend 1 CPU/0.5 GB. Backend private address kamino-api.railway.internal:8000. Public HTTPS enters Caddy on 8080. Volume d4094306-c92d-48f2-a9c8-294e18bf3977 mounts /data; PHOTO2SIM_DATA_DIR=/data/jobs. Backend PID 1 UID/GID verified 10001. Provider mock, no Meshy/Gemini keys configured. Private application token is required and is not compiled into JS or included here.

Cloud runtime: Python 3.12 container; MuJoCo 3.17.0, FastAPI 0.162.0, trimesh 5.2.0, numpy 2.5.4, pydantic 2.14.1. Dependencies are not fully pinned in the inherited Python project, so future rebuilds need runtime acceptance.

## Verification

- Frontend production build passed using live API mode and same-origin base; both index.html and assembly.html built.
- 9 deployment/assembly API tests passed locally. These supplement hosted checks.
- Caddy configuration validation passed; local proxy test passed authentication, mock rigid export, assembly create/process/export, a 46 MiB synthetic mesh upload, and restart persistence.
- Independent packaging review found and fixed missing VITE_API_MODE=live and an insufficient request-body cap. Follow-up found no new actionable issue.
- Both Railway Docker images built. Backend IPv6-only listener failed platform healthchecks; an isolated reproduction showed IPv4 refused/IPv6 accepted. Changing the listener to 0.0.0.0 passed Railway healthchecks and private proxy routing.
- Hosted /api/health returned 200 with provider=mock. Missing application token returned 401, valid access worked.
- Hosted synthetic rigid job fc064202-833a-42c4-95d6-0f6f4ade9222 processed and returned a 7,651-byte simulation ZIP. Browser reopened this job after explicitly restoring session-only API access, showing Synthetic demo and the actual backend validation scope.
- Hosted synthetic assembly job 9a6061d8-b95c-4d7e-a382-73cd133ceab4 was created, reviewed/saved to revision 2, processed and downloaded.
- Backend restart preserved both job records and exact ZIP SHA-256 hashes.
- This is not a physical-accuracy claim, native Windows acceptance, a real-provider test, or the final Figma/can integrated release. Hosted full 28-row Windows checklist was not run.

Evidence: outputs/railway-test-20261024 (ignored local artifacts). No credentials in evidence. Application access is intentionally held only in the browser session; page reload requires setting the token again.

## Domain and remaining work

Railway custom-domain ID 4b8f0258-4597-484e-87f6-e17ac81a7fc3, port 8080. Porkbun apex ALIAS changed from pixie.porkbun.com to Railway's exact ogd491jp.up.railway.app target; TTL 600. Added the exact _railway-verify TXT supplied by Railway UI. Its older CLI omitted this TXT requirement, so UI was used as the complete record source. Existing wildcard parking, nameservers, renewal, privacy and lock settings remain unchanged. Root ALIAS flattening follows Porkbun's documented root-domain method: https://kb.porkbun.com/article/85-how-to-connect-your-root-domain-when-your-web-host-wont-provide-an-ip-address

After DNS propagation, trusted HTTPS passed on kamino.design. Root page, /assembly.html, /api/health and authenticated saved-job GET all returned 200; unauthenticated job GET returned 401. The browser reopened the saved synthetic job on the custom domain. No TLS bypass was used. The initial certificate mismatch remains historical diagnostic evidence, not the final state.

User initially authorized $10 additional test usage and a 24-hour preview. The user subsequently clarified that the site should remain deployed. The shutdown deadline and all automatic stop actions have been removed. The follow-up is now named Kamino hosting cost alerts and is read-only: notify near the earlier $10 allowance or an unexpected increase; never stop, pause, scale down, delete or redeploy automatically. There is no scheduled hosting expiry. The legacy automation ID is kamino-preview-budget-and-shutdown, but its verified current prompt contains no shutdown behavior. Both services were rechecked SUCCESS/stopped=false and kamino.design/api/health returned provider=mock after this update. Cost monitoring is an app-scheduled follow-up, not a Railway-enforced cap. Initial attributed usage was $0.0004; final billing remains subject to usage. No unrelated Railway service was modified.

Next integration: carry deploy/railway onto the accepted can/UI branch, identify exact source, rebuild both services and repeat hosted smoke checks. Srijan remains owner of Windows can acceptance. Bright Data evidence and company-verification blocker are in bright-data-live-feasibility.md. Optional CAD and automatic parameter proposals remain later improvements.
