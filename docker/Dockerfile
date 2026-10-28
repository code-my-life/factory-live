# syntax=docker/dockerfile:1.7
# Image de factory-live : serveur Hono et PWA déjà construite, sur Node 24 LTS.
# L'image de base est épinglée par digest (relevé le 2026-10-28, node:24.22.1-bookworm-slim).
ARG NODE_IMAGE=node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/contracts/package.json packages/contracts/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json tsconfig.json ./
COPY packages packages
COPY apps apps
RUN npx tsc -b packages/domain packages/contracts apps/server \
 && VITE_DATA_SOURCE=demo npm run build -w @factory-live/web

# Dépendances d'exécution du seul serveur (le front est déjà construit).
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/contracts/package.json packages/contracts/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
      -w @factory-live/server -w @factory-live/domain -w @factory-live/contracts

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8446 \
    HERMES_HOME=/hermes \
    FACTORY_REPO=/factory \
    CLAUDE_PROJECTS=/claude-projects \
    DATA_DIR=/data \
    SECRETS_DIR=/run/secrets/factory-live \
    WEB_DIST=/app/apps/web/dist
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/domain/package.json packages/domain/
COPY --from=build /app/packages/domain/dist packages/domain/dist
COPY --from=build /app/packages/contracts/package.json packages/contracts/
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
RUN mkdir -p /data && chown 1000:1000 /data
USER 1000:1000
EXPOSE 8446
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8446/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/server/dist/main.js"]
