# Ticket System

A Linear-style issue tracker for teams: workspaces and teams, issues with
workflow states, labels, priorities, estimates, sub-issues and relations; board,
list, calendar and timeline views; cycles, projects (epics), initiatives and a
roadmap; triage, SLAs, recurring issues, customers and requests; dashboards and
insights; a collaborative editor with offline support; GitHub/GitLab/Bitbucket
automation; REST + GraphQL APIs, OAuth apps and outgoing webhooks; SAML/OIDC SSO,
SCIM, two-factor auth and an audit log.

Stack: SvelteKit 3 + Svelte 5 (TypeScript), Drizzle ORM on Postgres (Neon, or
any Postgres self-hosted), Better Auth, Tailwind v4 with bits-ui primitives
(shadcn look), Tiptap + Yjs editor. Migrated from Next.js 16 / React 19 in
2026-11 (docs/migration/).

## Run it

- **Vercel + Neon** (the default, free tiers): copy `env.template` to
  `.env.local`, fill in `DATABASE_URL` and `BETTER_AUTH_SECRET`, run
  `npm run db:migrate`, then `npm run dev` (http://localhost:3000;
  `npm run dev:local` points it at a local Postgres on :5433 instead). Deploy on
  Vercel with the same variables (adapter-vercel is picked automatically there);
  `vercel.json` schedules the daily cron.
- **Checks**: `npm run check` (svelte-check), `npm run lint`, `npm run build`.
  A clean checkout needs `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` (any dummy
  values; the build prerenders the auth module) to build; `PUBLIC_APP_URL` is
  inlined into the bundle. No `DATABASE_URL` is needed to build. CI
  (`.github/workflows/ci.yml`) runs all of this plus the tests against a
  throwaway Postgres service and never uses secrets.
- **Server actions** live in `src/lib/server/actions/`; after adding or changing
  an exported action run `npm run gen:actions` to regenerate the remote-function
  wrappers the UI calls (`src/lib/remote`, `src/lib/actions`).
- **Self-hosted with Docker** (internal use: one app container + Postgres;
  migrations and daily jobs run inside the app): `docker compose up -d --build`,
  see [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

API reference: [docs/API.md](docs/API.md).

**AI assistants (MCP):** Claude, ChatGPT and Claude Code connect to
`<your host>/mcp` (OAuth sign-in, or an `lc_…` API key) to read issues and
create, update and comment on them; see [docs/MCP.md](docs/MCP.md). For
claude.ai and ChatGPT the instance must be reachable over public HTTPS.

## Tests

Run targeted files, e.g. `npx vitest run src/tests/url-guard.test.ts`.

- `src/tests/*.test.ts` — unit tests. A few older ones (auth, db, membership,
  projects, tickets, github-account) talk to the database in `.env.local`.
- `src/tests/local-db/` — the issue service against a throwaway local Postgres
  (`npm run test:db` on the standard driver, `npm run test:db:neon` through the
  Neon driver; setup in docs/SELF_HOSTING.md). Skipped unless `LOCAL_DB_TESTS=1`
  and `DATABASE_URL` is a local host, so they never touch Neon.

## Upgrading an existing deployment

Run `npm run db:migrate` against the database before deploying new code.
Migration 0009 (durable webhook dispatch, description source) comes with
the 2026-11 security and reliability fixes; see
`docs/reports/2026-09-25-architecture-security-review.md` for what they fix.
Migration 0010 adds the workspace switch for AI connectors (MCP, see
`docs/MCP.md`). Migration 0011 adds the issue fields `waiting_on_id` and
`follow_up` (plus `follow_up_notified_on`, used by the daily follow-up job).
