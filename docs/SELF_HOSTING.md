# Self-hosting

The app normally runs on Vercel + Neon. It can also run anywhere Docker runs,
on a plain Postgres: the app speaks Neon's HTTP/WebSocket protocol, and the
compose file puts the open-source local Neon proxy in front of Postgres.

## What runs

| Service | What it does |
| --- | --- |
| `postgres` | Postgres 17. All data, including uploaded files, lives in the `pgdata` volume. |
| `neon-proxy` | `ghcr.io/timowilhelm/local-neon-http-proxy` — Neon's protocol in front of `postgres`. |
| `migrate` | Applies `src/db/migrations` (`scripts/migrate.mjs`), then exits. |
| `app` | The Next.js server (standalone build) on port `APP_PORT` (default 3000). |
| `cron` | Calls `/api/cron/daily` once a day (Vercel Cron's job when self-hosted). |

Plan for about 2 GB RAM and 5 GB disk for images and data.

## Start

```bash
cp docker/selfhost.env.example .env
# Fill in POSTGRES_PASSWORD, BETTER_AUTH_SECRET, CRON_SECRET (the file says how
# to generate each) and APP_URL — the URL people will open.
docker compose up -d --build
```

Open `APP_URL`, sign up, create a workspace and invite people.

- **HTTPS**: put a reverse proxy (Caddy, Traefik, nginx) in front of the `app`
  port and set `APP_URL` to the `https://` address. Rebuild after changing
  `APP_URL` (`docker compose up -d --build`): it is baked into the browser bundle.
- **Updates**: `git pull && docker compose up -d --build`. `migrate` runs first
  on every start.
- **Backups**: `docker compose exec postgres pg_dump -U tickets tickets > backup.sql`.

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
Postgres behind the same proxy, never against Neon (they are skipped unless
`NEON_PROXY_HOST` is set):

```bash
docker network create ts-test
docker run -d --rm --name ts-pg --network ts-test --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=main postgres:17-alpine
docker exec ts-pg psql -U postgres -d main -f - < docker/postgres-init.sql
docker run -d --rm --name ts-neon --network ts-test -p 4444:4444 \
  -e PG_CONNECTION_STRING=postgres://postgres:postgres@ts-pg:5432/main \
  ghcr.io/timowilhelm/local-neon-http-proxy:main
DATABASE_URL=postgres://postgres:postgres@db.localtest.me:5432/main NEON_PROXY_HOST=localhost:4444 \
  node scripts/migrate.mjs
pnpm test:db
docker rm -f ts-neon ts-pg && docker network rm ts-test
```

`docker exec … -f -` needs a moment after `docker run` while Postgres starts;
re-run it if it says the server isn't accepting connections.
