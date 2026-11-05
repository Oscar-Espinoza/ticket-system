# Self-hosting

The app normally runs on Vercel + Neon. For internal use it also runs anywhere
Docker runs, as **one app container plus a plain Postgres**. On start the app
applies its database migrations and schedules the daily jobs itself, so there
is nothing else to run.

## What runs

| Service | What it does |
| --- | --- |
| `postgres` | Postgres 17. All data, including uploaded files, lives in the `pgdata` volume. |
| `app` | The Next.js server (standalone build) on port `APP_PORT` (default 3000). On start it migrates the database, then runs the daily jobs (digests, SLAs, recurring issues, webhook retries) at `CRON_HOUR_UTC` (default 08:00 UTC). |

Plan for about 1 GB RAM and 3 GB disk for the image and data. Run **one** app
container: every app container started with `SELF_HOSTED=true` runs the daily
jobs. A run missed while the app is down is not made up at start; the next one
happens at the usual hour. A job still running after 10 minutes is reported in
the logs and the next job starts.

## Start

```bash
cp docker/selfhost.env.example .env
# Fill in POSTGRES_PASSWORD, BETTER_AUTH_SECRET (the file says how to generate
# each) and APP_URL — the URL people will open.
docker compose up -d --build
```

Open `APP_URL`, sign up, create a workspace and invite people.

- **HTTPS**: put a reverse proxy (Caddy, Traefik, nginx) in front of the `app`
  port and set `APP_URL` to the `https://` address. Rebuild after changing
  `APP_URL` (`docker compose up -d --build`): it is baked into the browser bundle.
- **Updates**: `git pull && docker compose up -d --build`. The new container
  applies any new migrations before it serves requests; if a migration fails it
  exits instead of starting (`docker compose logs app`).
- **Backups**: `docker compose exec postgres pg_dump -U tickets tickets > backup.sql`.

## Using a Postgres you already have

Skip the `postgres` service and run only the app image (Postgres 14 or newer):

```bash
docker build --build-arg NEXT_PUBLIC_APP_URL=https://tickets.example.com -t ticket-system-app .
docker run -d --name tickets --restart unless-stopped -p 3000:3000 \
  -e DATABASE_URL=postgres://tickets:secret@db.internal:5432/tickets \
  -e BETTER_AUTH_URL=https://tickets.example.com \
  -e NEXT_PUBLIC_APP_URL=https://tickets.example.com \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  ticket-system-app
```

Add `?sslmode=require` to `DATABASE_URL` if the server requires TLS. The app
uses the standard Postgres driver for any host that isn't `*.neon.tech`
(`DATABASE_DRIVER=pg|neon` overrides the guess) and keeps up to
`DATABASE_POOL_MAX` (default 10) connections open. A query running longer than
`DATABASE_STATEMENT_TIMEOUT_MS` (default 60000, `0` = no limit) is cancelled;
migrations are exempt.

## Optional features

Every integration switches off cleanly when its variables are empty
(`docker/selfhost.env.example` lists them): GitHub sign-in and PR automation
(`GITHUB_*`), email (`RESEND_*`), web push (`*VAPID*`), Slack (`SLACK_*`).

**SSO (SAML/OIDC) and SCIM** work self-hosted. A workspace admin proves the
company domain with a DNS TXT record (`_ticket-system.<domain>`), shown in
workspace settings → Security. The record must stay published: the app re-checks
it and stops trusting the IdP for that domain if it disappears.

## Database tests

The tests in `src/tests/local-db` run the issue service against a throwaway
local Postgres, never against Neon: they are skipped unless `LOCAL_DB_TESTS=1`
and `DATABASE_URL` points at this machine.

```bash
docker run -d --rm --name ts-pg -p 5433:5432 --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=main postgres:17-alpine
DATABASE_URL=postgres://postgres:postgres@localhost:5433/main node scripts/migrate.mjs
npm run test:db
```

`migrate.mjs` needs a moment after `docker run` while Postgres starts; it
retries on its own.

`npm run test:db:neon` runs the same suite through the Neon driver (what
Vercel uses). It needs the local Neon proxy in front of the same, still running
Postgres:

```bash
docker network create ts-test && docker network connect ts-test ts-pg
docker exec -i ts-pg psql -U postgres -d main < docker/neon-proxy-test-init.sql
docker run -d --rm --name ts-neon --network ts-test -p 4444:4444 \
  -e PG_CONNECTION_STRING=postgres://postgres:postgres@ts-pg:5432/main \
  ghcr.io/timowilhelm/local-neon-http-proxy:main
npm run test:db:neon
docker stop ts-neon && docker network rm ts-test
```

When you're done, `docker stop ts-pg` (it was started with `--rm`, so this
also deletes it and its data).
