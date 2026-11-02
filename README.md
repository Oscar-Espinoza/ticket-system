# Ticket System

A Linear-style issue tracker for teams: workspaces and teams, issues with
workflow states, labels, priorities, estimates, sub-issues and relations; board,
list, calendar and timeline views; cycles, projects (epics), initiatives and a
roadmap; triage, SLAs, recurring issues, customers and requests; dashboards and
insights; a collaborative editor with offline support; GitHub/GitLab/Bitbucket
automation; REST + GraphQL APIs, OAuth apps and outgoing webhooks; SAML/OIDC SSO,
SCIM, two-factor auth and an audit log.

Stack: Next.js 16, TypeScript, Drizzle ORM on Postgres (Neon), Better Auth,
Tailwind v4 + shadcn/ui.

## Run it

- **Vercel + Neon** (the default, free tiers): copy `env.template` to
  `.env.local`, fill in `DATABASE_URL` and `BETTER_AUTH_SECRET`, run
  `npm run db:migrate`, then `npm run dev`. Deploy on Vercel with the same
  variables; `vercel.json` schedules the daily cron.
- **Self-hosted with Docker** (any server, plain Postgres): see
  [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

API reference: [docs/API.md](docs/API.md).

## Tests

Run targeted files, e.g. `npx vitest run src/tests/url-guard.test.ts`.

- `src/tests/*.test.ts` — unit tests. A few older ones (auth, db, membership,
  projects, tickets, github-account) talk to the database in `.env.local`.
- `src/tests/local-db/` — the issue service against a throwaway local Postgres
  (`npm run test:db`, setup in docs/SELF_HOSTING.md). Skipped unless
  `NEON_PROXY_HOST` is set, so they never touch Neon.

## Upgrading an existing deployment

Run `npm run db:migrate` against the database before deploying new code.
Migration 0009 (durable webhook dispatch, description source) comes with
the 2026-11 security and reliability fixes; see
`docs/reports/2026-09-25-architecture-security-review.md` for what they fix.
