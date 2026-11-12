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
- **MCP views**: the cards Claude and ChatGPT show for the `/mcp` tools are a
  separate Svelte bundle in `src/mcp-ui/`, built to one HTML file
  (`src/lib/server/mcp/ui/app.html`, generated, not committed) by
  `npm run build:mcp-ui`. `npm run dev`, `dev:local` and `build` run it first
  (`predev`, `predev:local`, `prebuild`; the Docker build goes through
  `npm run build`), so you only call it yourself after editing `src/mcp-ui/` while
  a dev server is running. Without the file, tests and `vite dev` serve a
  placeholder page and `vite build` refuses to continue.
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

**Email verification and password reset:** with email configured
(`RESEND_API_KEY`, `EMAIL_FROM`) password sign-ups get a verification link that
works only while signed in to that account, and a verified address is what lets
"Continue with Google/GitHub" link to an existing password account. "Forgot
password?" emails a one-hour, single-use reset link; a reset verifies the address
and signs out every session (on an unverified account it also removes two-factor,
API keys, connected apps and more, after the page lists them and the person
confirms; a first SSO sign-in does the same, so ask people to verify before
rolling SSO out). `REQUIRE_EMAIL_VERIFICATION=true` (off by default,
ignored without email) also blocks password sign-in until the address is
verified. Details, the steps for existing users and the admin fallback without
email: [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md#email-verification).

API reference: [docs/API.md](docs/API.md).

**AI assistants (MCP):** Claude, ChatGPT and Claude Code connect to
`<your host>/mcp` (OAuth sign-in, or an `lc_…` API key) to read issues and
create, update and comment on them; see [docs/MCP.md](docs/MCP.md). For
claude.ai and ChatGPT the instance must be reachable over public HTTPS.

## Tests

Run targeted files, e.g. `npx vitest run src/tests/url-guard.test.ts`.

The test setup refuses to start when `DATABASE_URL` (shell or `.env.local`) is
not a local host, so a hosted `.env.local` can never be written to by a test.
Put a local one in front: `DATABASE_URL=postgres://postgres:postgres@localhost:5433/main
DATABASE_DRIVER=pg npx vitest run <file>`.

- `src/tests/*.test.ts` — unit tests. A few older ones (auth, db, membership,
  projects, tickets, github-account) write to whatever local `DATABASE_URL` is set.
- `src/tests/local-db/` — the issue service against a throwaway local Postgres
  (`npm run test:db` on the standard driver, `npm run test:db:neon` through the
  Neon driver; setup in docs/SELF_HOSTING.md). Skipped unless `LOCAL_DB_TESTS=1`;
  with it set, a `DATABASE_URL` that is not a local host is an error, so they
  never touch Neon and never skip silently. CI also fails if any of them skip.

## Database tooling

`drizzle-kit generate` needs no database. `push`, `migrate` and `studio` refuse
a non-local `DATABASE_URL` (including the one in `.env.local`) unless
`DRIZZLE_ALLOW_REMOTE=1` is set in the shell. For dev use a local database:
`DATABASE_URL=postgres://postgres:postgres@localhost:5433/<db> npx drizzle-kit push`.
Real deployments migrate with `npm run db:migrate`.

## Upgrading an existing deployment

Run `npm run db:migrate` against the database before deploying new code.
Migration 0009 (durable webhook dispatch, description source) comes with
the 2026-11 security and reliability fixes; see
`docs/reports/2026-09-25-architecture-security-review.md` for what they fix.
Migration 0010 adds the workspace switch for AI connectors (MCP, see
`docs/MCP.md`). Migration 0011 adds the issue fields `waiting_on_id` and
`follow_up` (plus `follow_up_notified_on`, used by the daily follow-up job).
