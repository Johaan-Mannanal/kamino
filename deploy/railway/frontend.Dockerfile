FROM node:22-bookworm-slim AS build
WORKDIR /app/frontend
# This lockfile uses pnpm v9 format; pin the verified build tool explicitly.
RUN npm install --global pnpm@10.15.1
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN npm_config_manage_package_manager_versions=false pnpm install --frozen-lockfile
COPY frontend/ ./
ENV VITE_API_BASE_URL=/ VITE_API_MODE=live
RUN npm_config_manage_package_manager_versions=false pnpm run build

FROM caddy:2.10.2-alpine
COPY deploy/railway/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv
ENV PORT=8080
EXPOSE 8080
