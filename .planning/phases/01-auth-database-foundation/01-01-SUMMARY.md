---
phase: 01-auth-database-foundation
plan: 01
type: summary
status: complete
completed: 2026-06-01
---

# Plan 01-01 Summary — Scaffold + Database Foundation

## Outcome

Next.js 16 app scaffolded, full 7-table schema (8 pgTable defs) applied to live Neon as a versioned migration, dual Neon drivers wired, vitest operational with a passing real-DB connectivity test. Foundation ready for the auth slices (Wave 2+).

## Artifacts produced (for downstream plans — use directly, no exploration)

### `src/lib/db.ts`
- `db` — Drizzle **neon-http** instance (app queries, fast single-query).
- `authDb` — Drizzle **neon-serverless** (WebSocket Pool) instance — **use this for Better Auth** (neon-http throws "No transactions support").
- Both constructed with `{ client, schema }`.

### `src/db/schema.ts` — exported tables (names SINGULAR in Postgres, plural JS exports)
| JS export | table name |
|-----------|-----------|
| `users` | `user` |
| `sessions` | `session` |
| `accounts` | `account` |
| `verifications` | `verification` |
| `projects` | `project` |
| `projectMembers` | `project_member` |
| `invitations` | `invitation` |
| `tickets` | `ticket` |
- `ticketStatusEnum` = `pgEnum('ticket_status', ['backlog','todo','in_progress','in_review','done'])` (D-07).
- `ticket` has `unique().on(projectId, ticketNumber)` (D-08).
- Better Auth core columns match Better Auth defaults (camelCase: `emailVerified`, `accessToken`, etc.).

### Config / tooling
- `drizzle.config.ts` — schema `./src/db/schema.ts`, out `./src/db/migrations`, loads `.env.local` via `@next/env`.
- `vitest.config.ts` — node env, globals, `@` → `src` alias, setupFiles `src/tests/setup.ts`.
- `src/tests/setup.ts` — loads `.env.local` via **dotenv** (NOT @next/env — it skips `.env.local` under `NODE_ENV=test`).
- `.env.example` + `env.template` — document all 6 env vars (placeholders only).
- Migration `src/db/migrations/0000_mushy_johnny_storm.sql` — applied to Neon; all 8 tables confirmed via `information_schema`.

## Verification
- `npm run build`, `npm run lint`, `npx tsc --noEmit` → exit 0.
- `npm test` → `src/tests/db.test.ts` passes (real insert+select+cleanup against Neon).
- `@neondatabase/serverless` pinned `^0.10.4` (resolved 0.10.4) — NOT 1.x (drizzle#5208).

## Deviations from plan
- **Scaffold via temp dir** — `create-next-app` refuses non-empty dirs; scaffolded into temp, discarded its CLAUDE.md/README.md, merged up. Existing CLAUDE.md/README.md untouched.
- **`.gitignore` tightened** — scaffold's blanket `.env*` would have excluded `.env.example`; changed to ignore real env files while keeping `.env.example` tracked.
- **Next.js 16.2.7** (registry shifted from 16.2.6) — within orchestrator's "create-next-app@latest / Next 16" decision.
- **dotenv added (devDep)** — required for tests to read `.env.local` (Next's loader skips it in test mode). Surfaced at the migration checkpoint; also fixed vitest `@` alias and drizzle env loading at the same time.

## Notes for Wave 2 (Plan 01-02)
- Import `db`/`authDb` from `@/lib/db`; tables from `@/db/schema`.
- Better Auth must use `drizzleAdapter(authDb, { provider: 'pg' })`.
- Tests resolve `@/*` and read `.env.local` automatically via the setup file.
