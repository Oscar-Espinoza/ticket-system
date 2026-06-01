# Project Research Summary

**Project:** Linear-Clone Ticket System
**Domain:** Multi-tenant issue tracking with GitHub integration (Linear-style)
**Researched:** 2026-06-01
**Confidence:** HIGH

## Executive Summary

This is a multi-tenant ticket management system with GitHub-sync as its core differentiator: creating a branch from a ticket and merging its PR should automatically advance the ticket through statuses — all on free tiers (Neon + Vercel Hobby). The stack is fully locked: Next.js 15 App Router, Neon Postgres + Drizzle ORM, Better Auth 1.6, Tailwind v4 + shadcn/ui, @dnd-kit/react for the kanban board, and @octokit/rest for GitHub API calls. There are two live compatibility landmines that must be handled from day one: `@neondatabase/serverless` must be pinned to `^0.10.4` (v1.0.0 broke drizzle-orm/neon-http, open bug #5208), and Better Auth requires a WebSocket-based Drizzle instance — not neon-http — for its transactional auth writes.

The feature set is clearly bounded. Table stakes are user accounts, project creation, per-project ticket identifiers (APP-42), ticket CRUD, a five-column kanban board, invite links, and owner/member role enforcement. The differentiators are one-click GitHub sign-in, branch creation from a ticket using the user's own OAuth token, and webhook-driven status transitions (PR opened → In Review, PR merged → Done). Everything else — labels, comments, real-time sync, email invitations — is explicitly deferred to v2, and those boundaries are firm. The architecture follows a clear dependency chain: auth foundation → multi-tenancy → tickets/board → GitHub integration → polish/deploy.

The most consequential risks are security-oriented. IDOR (missing project membership checks in Server Actions) and the GitHub token never reaching the client are both "never acceptable" violations with high recovery cost. The webhook handler has two distinct failure modes that brick the entire GitHub-sync value proposition: the webhook route must be excluded from Next.js middleware, and the raw body must be read before any JSON parsing for HMAC-SHA256 verification. Both require automated test coverage. A secondary risk is the Vercel Hobby 10-second function timeout on the webhook handler; using Next.js `after()` to defer DB work after responding 200 is the prescribed mitigation.

---

## Key Findings

### Recommended Stack

The stack is fully locked with no open decisions. All choices are in `.planning/PROJECT.md` Constraints and have been validated against official sources and known compatibility issues. The critical operational fact is that two Drizzle instances are required: `drizzle-orm/neon-http` for application queries (faster, stateless) and `drizzle-orm/neon-serverless` (WebSocket) for the Better Auth database instance (interactive transactions). Both point at the same Neon database.

**Core technologies:**
- **Next.js 15 App Router + TypeScript:** Full-stack framework; single repo for frontend and API routes on Vercel Hobby
- **Neon Postgres + Drizzle ORM 0.39.x:** Serverless Postgres (free 512 MB); Drizzle gives type-safe SQL with first-class Neon support
- **`@neondatabase/serverless` pinned to `^0.10.4`:** v1.0.0 broke neon-http; this pin is non-negotiable until drizzle-orm#5208 ships
- **Better Auth 1.6 with Drizzle adapter:** Replaces Auth.js v5 (deprecated/security-patch-only); native Drizzle adapter, Organization plugin for multi-tenancy, email/password + GitHub OAuth built in
- **Tailwind CSS v4 + shadcn/ui:** `shadcn@latest init` scaffolds v4 by default; configuration lives in `globals.css` under `@theme`; no `tailwind.config.js`
- **@dnd-kit/react 0.4.x + @dnd-kit/helpers:** Current maintained API (not legacy @dnd-kit/core); React 19 type-compatible
- **@octokit/rest 22.0.x:** Typed REST wrapper for branch creation and webhook management; requires Node 20+ (Vercel Hobby uses Node 20)
- **bcryptjs 2.4.x:** Pure-JS password hashing — no native addon, runs on Vercel Node runtime; work factor 10 (not 12) on serverless

See `.planning/research/STACK.md` for detailed rationale, version compatibility table, and alternatives considered.

### Expected Features

The feature set has one non-obvious design constraint that affects architecture: the branch name *is* the ticket-to-PR link. No separate join table, no magic comment parsing — the webhook handler extracts the ticket identifier (e.g. `app-42`) from the PR branch name via regex. Branch creation must use the exact naming convention `{key-lowercase}-{number}-{slugified-title}` or the auto-status feature silently does nothing.

**Must have (table stakes):**
- User accounts (email/password + GitHub OAuth)
- Project creation with name + ticket key prefix (e.g. "APP")
- Per-project ticket identifier (APP-42) via atomic `UPDATE...RETURNING` counter
- Ticket CRUD: title, description, assignee
- Five-column kanban board with drag-and-drop (Backlog → Todo → In Progress → In Review → Done)
- Project invite via shareable link (no email provider)
- Owner / member roles with server-side enforcement

**Should have (differentiators — the entire reason to build this):**
- GitHub OAuth sign-in (one-click for developers; also the path to an access token)
- "Connect GitHub" gate: email/password users must explicitly link GitHub before repo features appear
- Create GitHub branch from a ticket (per-user OAuth token, REST `POST /git/refs`)
- PR opened → ticket moves to "In Review" (webhook, `action: "opened"`)
- PR merged → ticket moves to "Done" (webhook, `action: "closed"` + `merged: true`)
- Per-project webhook registration with per-project HMAC secret

**Defer (v2+):**
- Labels, priority, due dates — no GitHub-sync value
- Comments / activity feed — large scope; GitHub PR review is the right venue
- Real-time board sync — optimistic updates + `revalidatePath` are sufficient; avoids WebSocket infra cost
- Email-delivered invitations — copy-paste link avoids needing an email provider
- Status column customization — five fixed columns cover the development lifecycle

See `.planning/research/FEATURES.md` for the full feature matrix, GitHub-sync workflow specification, and competitor analysis.

### Architecture Approach

The architecture is a Next.js monolith with clear internal boundaries: RSC pages for data fetching, Server Actions for mutations (with a mandatory Data Access Layer that enforces auth + membership before every DB write), and Route Handlers only for external callers (GitHub webhooks, invite token verification). The GitHub token is fetched from the `accounts` table at action time — never stored in the JWT session payload, never exposed to the client. Better Auth's tables (`users`, `accounts`, `sessions`, `verificationTokens`) are owned by the framework; the app's custom schema sits alongside them.

**Major components:**
1. **Auth (Better Auth 1.6):** Session lifecycle, email/password + GitHub OAuth, `githubConnected` boolean in session for UI gating; access token stays in `accounts` table, fetched at action time
2. **Data Access Layer (`src/lib/dal/`):** `requireAuth()` + `requireProjectMember(projectId)` + `requireProjectOwner(projectId)` — called at the top of every Server Action and Route Handler that touches project-scoped data; the security boundary, not middleware
3. **Projects & Multi-Tenancy:** Project CRUD, invite link generation/acceptance, `project_members` with owner/member roles; open decision on Better Auth Organization plugin vs. hand-rolled tables (see Gaps)
4. **Tickets & Kanban Board:** Ticket CRUD with atomic `UPDATE...RETURNING` counter, @dnd-kit board with optimistic state, assignee picker scoped to project members
5. **GitHub Integration:** `src/lib/github/` for Octokit instance factory + branch creation + webhook registration; `POST /api/webhooks/github/[projectId]` Route Handler for inbound events; raw body → HMAC → parse → status transition

See `.planning/research/ARCHITECTURE.md` for the full schema, data flow diagrams, and anti-patterns with code examples.

### Critical Pitfalls

All pitfalls below are HIGH confidence and verified against official sources.

1. **Webhook route blocked by auth middleware** — The GitHub webhook has no session cookie; any middleware catch-all returns 401/302, silently breaking all status transitions. Fix: explicitly exclude `/api/webhooks/*` from the `middleware.ts` matcher. Verify with a test that POST to the webhook endpoint without a session returns non-401.

2. **Raw body consumed before HMAC verification** — Calling `request.json()` first consumes the body stream; re-serializing changes whitespace/key order so the hash never matches. Fix: always `const rawBody = await req.text()` first, verify HMAC against that string, then `JSON.parse(rawBody)`.

3. **IDOR — missing project membership check** — Middleware confirms the user is logged in, not that they belong to *this* project. Any Server Action or Route Handler that fetches project-scoped data without calling `requireProjectMember()` is an IDOR vector. Fix: the DAL helper is the security boundary; call it at the top of every scoped handler.

4. **GitHub access token exposed to client** — Storing the token in the JWT session and forwarding it via the `session` callback makes it readable via `useSession()`. Fix: only store `githubConnected: boolean` in the session; fetch the token from the `accounts` table in Server Actions.

5. **Ticket counter race condition** — `SELECT max() + 1` then `INSERT` allows concurrent requests to produce duplicate APP-42 identifiers. Fix: single `UPDATE projects SET ticket_counter = ticket_counter + 1 RETURNING ticket_counter` — atomic in Postgres at READ COMMITTED, compatible with neon-http. Add a unique constraint on `(project_id, ticket_number)` as a backstop.

6. **Vercel Hobby 10-second timeout on webhook handler** — Synchronous DB work after HMAC verification can timeout under Neon cold-start conditions; GitHub retries on non-2xx, causing duplicate state transitions. Fix: use Next.js `after()` to defer DB work; respond 200 immediately; store `X-GitHub-Delivery` as an idempotency key.

7. **`@neondatabase/serverless` v1.0.0 breaking change** — Breaks `drizzle-orm/neon-http` (open Drizzle bug #5208 as of Jan 2026). Fix: pin to `^0.10.4` in `package.json`; do not upgrade without verifying the Drizzle issue is closed.

See `.planning/research/PITFALLS.md` for the full checklist, recovery strategies, and phase-to-pitfall mapping.

---

## Implications for Roadmap

Based on research, the dependency chain is deterministic: every later phase requires infrastructure from earlier phases.

### Phase 1: Foundation — Auth + Database

**Rationale:** Everything else depends on having users and sessions. Better Auth's schema (including `accounts` for the GitHub token) must exist from day one. The dual Drizzle instance pattern (neon-http for app, neon-serverless for auth) must be established here — retrofitting it later touches every data access file.

**Delivers:** Working email/password sign-up/in, GitHub OAuth sign-in, protected dashboard page, all schema tables created via Drizzle migrations

**Addresses features:** User accounts (email/password + GitHub OAuth), Connect-GitHub gate infrastructure (`accounts.access_token` stored by Better Auth)

**Avoids:** Driver version pin (Pitfall #7), bcryptjs work factor 10, `githubConnected` boolean in session but token never in session (Pitfall #4), Better Auth on neon-serverless not neon-http

**Research flag:** Standard — Better Auth 1.6 + Drizzle is well-documented; no additional research needed

---

### Phase 2: Projects + Multi-Tenancy

**Rationale:** Projects and membership are prerequisites for every ticket and GitHub integration feature. The invite link flow, role enforcement, and `requireProjectMember()` DAL helper must exist before any ticket work starts.

**Delivers:** Project creation (name + ticket_key), shareable invite link generation and acceptance, owner/member roles enforced server-side, project settings with member list

**Addresses features:** Project creation, invite collaborators, role enforcement

**Avoids:** IDOR pitfall (Pitfall #3) — `requireProjectMember()` established here and enforced in all future phases; invite token entropy + expiry + single-use

**Open decision to resolve during planning:** Whether "project" maps onto Better Auth's Organization plugin (reusing its `members`/`invitations` tables) or is a hand-rolled `projects` + `project_members` table. The Organization plugin's invitation system defaults to emailed invites — the app needs copy-paste links. This trade-off must be evaluated when planning this phase.

**Research flag:** May need targeted research on Better Auth Organization plugin invitation customization (link-only flow, no email transport)

---

### Phase 3: Tickets + Kanban Board

**Rationale:** Tickets are the core entity; the kanban board is the primary UI surface. The atomic counter pattern, @dnd-kit integration, and assignee picker all depend on project membership being established.

**Delivers:** Ticket CRUD with per-project APP-42 identifiers, five-column kanban board with drag-and-drop, optimistic UI on drag, assignee picker scoped to project members

**Addresses features:** Ticket CRUD, per-project identifier, kanban board, ticket assignee

**Avoids:** Ticket counter race condition (Pitfall #5) — atomic `UPDATE...RETURNING` + unique constraint; dnd-kit snap-back UX pitfall (update server only on `onDragEnd`); N+1 query for assignees (Drizzle `with` eager loading)

**Research flag:** Standard — @dnd-kit/react kanban and atomic Postgres counter are established patterns

---

### Phase 4: GitHub Integration

**Rationale:** This is the differentiating feature and the most complex phase. All prior phases must be complete: auth provides the OAuth token, projects provide the webhook secret storage, tickets provide the identifiers that webhooks match against.

**Delivers:** "Connect GitHub" flow for email/password users, project-level repo configuration + webhook registration, branch creation from a ticket, inbound webhook handler with PR → status transitions

**Addresses features:** Connect-GitHub gate, branch creation, PR opened → In Review, PR merged → Done, per-project webhook secret

**Avoids (all must be verified with tests):**
- Pitfall #1: webhook route excluded from middleware matcher
- Pitfall #2: raw body read before HMAC verification
- Pitfall #6: `after()` for DB work, idempotency key on `X-GitHub-Delivery`
- Pitfall #4: GitHub token fetched from `accounts` table in Server Action, never in session

**Research flag:** High pitfall density — run the PITFALLS.md "Looks Done But Isn't" checklist as an acceptance gate for this phase

---

### Phase 5: Polish + Deploy

**Rationale:** Vercel deployment, error states, loading UI, and optimistic board updates are the final hardening pass before the product is usable.

**Delivers:** Public Vercel deployment, error boundary and empty-state UI, optimistic kanban drag, free-tier usage audit (Neon 512 MB, Vercel Hobby limits), environment variable audit

**Research flag:** Standard — Vercel + Next.js deployment is well-documented

---

### Phase Ordering Rationale

- Auth must be Phase 1 because Better Auth's schema (especially `accounts`) is shared infrastructure used in every subsequent phase. The dual Drizzle instance pattern must be established before any other data access code is written.
- Multi-tenancy must precede tickets because the ticket schema has a foreign key to projects, and `requireProjectMember()` is the security primitive all later phases depend on.
- Tickets must precede GitHub integration because webhooks look up tickets by their identifiers. The branch naming convention encodes the ticket key and number, so both must exist before the webhook handler can do anything useful.
- Polish/deploy is last because it presupposes a working, complete feature set to harden.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Projects + Multi-Tenancy):** Open decision on Better Auth Organization plugin vs. hand-rolled tables; if using the plugin, research how to produce a copy-paste invite link without sending email

Phases with standard patterns (skip research-phase):
- **Phase 1 (Auth + Database):** Better Auth 1.6 + Drizzle dual-driver pattern is well-documented with official examples
- **Phase 3 (Tickets + Kanban):** @dnd-kit/react kanban and atomic Postgres counter are established patterns
- **Phase 4 (GitHub Integration):** Primitives are documented; the pitfall checklist is the guide
- **Phase 5 (Polish + Deploy):** Standard Next.js + Vercel deployment

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against official sources and npm; known compatibility issues documented with issue links |
| Features | HIGH | Table stakes and GitHub-sync workflows verified against Linear, GitHub, and official API docs; competitor details MEDIUM |
| Architecture | HIGH | Patterns verified against official docs; component boundaries and data flows are concrete and code-backed |
| Pitfalls | HIGH | All critical pitfalls verified against official docs or multiple credible sources; recovery strategies documented |

**Overall confidence:** HIGH

### Gaps to Address

- **Better Auth Organization plugin invite customization:** Open decision for Phase 2 planning — whether a "project" maps onto a Better Auth Organization and how to make its invitation system produce a copy-paste link instead of sending email. Resolve during Phase 2 planning; may need targeted research.
- **GitHub token encryption at rest:** Better Auth writes `access_token` to the `accounts` table as plaintext. Accept plaintext for MVP with a documented follow-up, or encrypt with AES-256-GCM from the start using a separate `APP_SECRET` env var. Decide during Phase 1 or Phase 4 planning.
- **`@neondatabase/serverless` pin:** Pinned to `^0.10.4` pending drizzle-orm#5208. Monitor when drizzle-orm 0.40+ ships; reassess the pin at that point.

---

## Sources

### Primary (HIGH confidence)
- [Better Auth 1.6 + Organization plugin docs](https://better-auth.com/docs/plugins/organization) — multi-tenancy schema, roles, invitations
- [Neon serverless driver docs](https://neon.com/docs/serverless/serverless-driver) — HTTP vs WebSocket capabilities and limitations
- [Drizzle ORM connect-neon](https://orm.drizzle.team/docs/connect-neon) — neon-http and neon-serverless setup patterns
- [GitHub webhook signature verification](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) — HMAC-SHA256 verification
- [GitHub REST API: Create a git reference](https://docs.github.com/en/rest/git/refs) — branch creation payload
- [GitHub webhook events: pull_request](https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request) — event schema and action values
- [drizzle-orm#5208](https://github.com/drizzle-team/drizzle-orm/issues/5208) — neon-http + @neondatabase/serverless@1.0.0 breaking change
- [better-auth#4747](https://github.com/better-auth/better-auth/issues/4747) — neon-http interactive transaction incompatibility
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — v4 migration and new defaults
- [dndkit.com React quickstart](https://dndkit.com/react/quickstart/) — @dnd-kit/react vs legacy @dnd-kit/core
- [Linear GitHub Integration docs](https://linear.app/docs/github-integration) — reference implementation for branch naming and status sync
- [Auth.js migration to Better Auth](https://authjs.dev/getting-started/migrate-to-better-auth) — confirmed Auth.js deprecation status

### Secondary (MEDIUM confidence)
- [Neon auth comparison guide](https://neon.com/guides/nextauth-neon-auth-better-auth-postgres) — Auth.js vs Better Auth tradeoffs
- [Next.js CVE-2025-29927 middleware bypass](https://www.authgear.com/post/nextjs-security-best-practices/) — why middleware is not a security boundary
- [PostgreSQL single UPDATE RETURNING atomicity](https://oneuptime.com/blog/post/2026-01-25-postgresql-race-conditions/view) — atomic counter pattern
- [Vercel `after()` for background work](https://vercel.com/docs/functions/configuring-functions/duration) — post-response processing on Hobby tier
- [bcrypt vs bcryptjs on Vercel](https://github.com/vercel/next.js/issues/69002) — native bcrypt unsupported on serverless

---
*Research completed: 2026-06-01*
*Ready for roadmap: yes*
