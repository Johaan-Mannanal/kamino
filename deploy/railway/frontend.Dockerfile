# Combined acceptance candidate. Native clean installs/builds verified; container build pending.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/
COPY prototypes/kamino-ui/package.json prototypes/kamino-ui/pnpm-lock.yaml ./prototypes/kamino-ui/
RUN cd frontend && pnpm install --frozen-lockfile
RUN cd prototypes/kamino-ui && pnpm install --frozen-lockfile
COPY frontend ./frontend
COPY prototypes/kamino-ui ./prototypes/kamino-ui
COPY deploy/railway/assemble-web.mjs ./deploy/railway/assemble-web.mjs
ARG KAMINO_PUBLIC_ORIGIN=https://kamino.design
ENV VITE_API_BASE_URL=/ VITE_API_MODE=live
ENV VITE_KAMINO_ASSEMBLY_URL=${KAMINO_PUBLIC_ORIGIN}/assembly.html
RUN cd frontend && pnpm run build
RUN cd prototypes/kamino-ui && pnpm run build
RUN node deploy/railway/assemble-web.mjs frontend/dist prototypes/kamino-ui/dist /web

FROM caddy:2.10.2-alpine
COPY deploy/railway/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /web /srv
ENV PORT=8080
EXPOSE 8080
