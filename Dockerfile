# syntax=docker/dockerfile:1
# Self-hosted image (see docs/SELF_HOSTING.md). Vercel deploys don't use this.
# SvelteKit + adapter-node. On start the app applies migrations and schedules
# the daily jobs itself (SELF_HOSTED=true, src/hooks.server.ts init): it needs
# only a Postgres.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# PUBLIC_* values are inlined into the browser bundle at build time, and
# PUBLIC_APP_URL is also the origin the server trusts (CSRF): rebuild when it
# changes.
ARG PUBLIC_APP_URL=http://localhost:3000
ARG PUBLIC_VAPID_PUBLIC_KEY=
ENV PUBLIC_APP_URL=$PUBLIC_APP_URL PUBLIC_VAPID_PUBLIC_KEY=$PUBLIC_VAPID_PUBLIC_KEY
# Modules read these at import time; real values come from the runtime env.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-only-placeholder-secret-value \
    npx vite build
# adapter-node bundles devDependencies and keeps `dependencies` external.
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-alpine AS runner
WORKDIR /app
# BODY_SIZE_LIMIT: uploads/attachments accept 4 MB, webhooks 5 MB.
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 SELF_HOSTED=true BODY_SIZE_LIMIT=6M
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/build ./build
COPY --from=build --chown=app:app /app/src/db/migrations ./src/db/migrations
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "build"]
