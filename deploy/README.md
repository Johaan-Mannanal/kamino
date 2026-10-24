# Vultr backend deployment

Deploy the backend feature branch using a small CPU server; Meshy performs reconstruction externally. Confirm the account's event credits and actual hourly/monthly price before provisioning. A 2-vCPU/4-GB instance is the initial capacity target, not a guaranteed price. Account sign-in, instance access and any required spending confirmation must be available before deployment can finish.

## Server prerequisites

Use Ubuntu 24.04 with SSH access and Docker Engine plus Compose v2. Follow [Vultr's Docker installation guide](https://docs.vultr.com/how-to-install-docker-on-ubuntu-24-04). Allow inbound HTTPS/HTTP on 443/80 and restrict SSH access appropriately. A DNS hostname must resolve to the server so Caddy can obtain a publicly trusted certificate. Keep the backend's port 8000 internal; Compose publishes only the proxy. If no project domain is available, a hostname such as `photo2sim.SERVER-IP-WITH-DASHES.sslip.io` can resolve to the real public IP; [the DNS service documents HTTPS with Caddy](https://sslip.io/). Verify actual resolution and certificate issuance before using it as the public endpoint.

## Install the reviewed source

```bash
git clone --branch codex/backend-pipeline https://github.com/Johaan-Mannanal/photo2sim.git
cd photo2sim
git rev-parse HEAD
```

Compare the SHA with Johaan's verified deployment handoff. For updates, preserve local environment files and named volumes; fetch and fast-forward only after confirming the intended branch/commit.

Create a private `.env.deploy` from `deploy/env.example`, set permissions to 600, and fill:

- `PHOTO2SIM_PUBLIC_HOST`: actual public DNS hostname, without scheme/path.
- `PHOTO2SIM_API_TOKEN`: one randomly generated application access token; team clients use it in the Authorization header. It is different from all provider keys.
- `PHOTO2SIM_CORS_ORIGINS`: exact frontend origins, comma-separated. Keep localhost origins for Atul's local frontend, then add the actual deployed frontend origin.
- Gemini/Meshy keys and model names, transferred privately from the operator's local configuration. No Agentverse or Vultr infrastructure key belongs in the backend container.
- `PHOTO2SIM_PROVIDER=mock` initially, so deployment acceptance cannot incur reconstruction charges.

Never print resolved Compose configuration with real credentials; use `config --quiet`. Docker's build context excludes `.env` files, and the image copies only package sources and metadata. The backend runs as a non-root user. The application token is a private team-demo gate, not a multi-user account system; do not bake it into a public frontend bundle. Clients need to provide it through their private configuration or an authenticated server-side proxy.

## Start and verify

```bash
docker compose --env-file .env.deploy config --quiet
docker compose --env-file .env.deploy up -d --build
docker compose --env-file .env.deploy ps
curl --fail https://YOUR_HOST/api/health
```

Caddy provisions HTTPS for the hostname. DNS and inbound 80/443 must work before certificate issuance. The [Caddy configuration](Caddyfile) caps request bodies at 45 MB; the API additionally enforces per-image limits.

On Johaan's laptop (or an operator environment with the base project installed), run:

```bash
python tools/deployment/smoke.py --base-url https://YOUR_HOST --env-file .env.deploy --mock
```

This checks unauthenticated rejection, token acceptance, mock upload, property confirmation, simulation export/validation, and ZIP download. It refuses to create a job if the provider is not mock. Restart the backend and check the saved job/ZIP again to confirm the persistent volume works.

Once the mock smoke passes, change only `PHOTO2SIM_PROVIDER` to `meshy`, retaining the verified provider keys. Then:

```bash
docker compose --env-file .env.deploy up -d backend
python tools/deployment/smoke.py --base-url https://YOUR_HOST --env-file .env.deploy
```

The final command checks health and application access only; it does not spend Meshy/Gemini credits. Record the public URL, source SHA, running package versions and actual results before reporting deployment complete. A CI container smoke is not evidence of a running Vultr deployment.

## Persistence and rollback

Jobs and SQLite live in the named `jobs` volume mounted at `/data`; restart/rebuild preserves it. Caddy certificates use separate persistent volumes. Never use `docker compose down --volumes` as routine cleanup. Keep a copy of the job volume before schema changes or destructive maintenance. To roll back code, check out the previously verified commit and rebuild with the same private configuration and volumes.
