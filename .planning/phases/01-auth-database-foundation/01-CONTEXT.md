# Phase 1: Auth + Database Foundation - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create accounts (email/password **and** GitHub OAuth), sign in, stay
signed in across browser refreshes, and log out from any page — landing on a
protected page when authenticated. In parallel, the **complete** database
schema for the whole product (all 7 tables) is created as Drizzle migrations
against Neon using the pinned `@neondatabase/serverless@^0.10.4`.

**In scope:** Better Auth setup (email/password + GitHub OAuth providers),
sessions, protected-route redirect, logout, the full Drizzle schema + initial
migration, split Neon driver wiring (`neon-http` for app, `neon-serverless` for
auth).

**Out of scope (later phases):** project CRUD (Phase 2), `requireProjectMember`
authorization (Phase 2), invitations (Phase 3), ticket features (Phase 5),
board (Phase 6), GitHub branch/token elevation + webhooks (Phases 7-8). Tables
for those features are *created* here but not *used* until their phase.

</domain>

<decisions>
## Implementation Decisions

### GitHub OAuth Scopes
- **D-01:** At GitHub sign-in (AUTH-02), request **minimal scopes only**:
  `read:user` + `user:email`. The stored access token therefore has no repo
  access in Phase 1.
- **D-02:** Elevated scopes (`repo`, `admin:repo_hook`) are requested **later**
  via the dedicated "Connect GitHub" flow in Phase 7 — uniformly for both
  GitHub-login and email/password users (GitHub-login users re-consent once to
  unlock repo features). This keeps Phase 1 least-privilege and avoids a scary
  "full repo access" consent at signup.

### GitHub Token at Rest
- **D-03:** Accept Better Auth's **default plaintext** storage of the GitHub
  `access_token` in the `accounts` table for v1. Justified because the token
  carries only `read:user`/`user:email` until Phase 7.
- **D-04:** Isolate all token reads behind a **small accessor function** so that
  adding **AES-256-GCM** encryption in Phase 7 (when repo scopes raise the
  stakes) is a localized change. Encryption itself is deferred to Phase 7.
- **D-05 (reaffirms locked decision):** The GitHub token is **never** placed in
  the session JWT — the session carries only a derived `githubConnected: boolean`.

### Database Schema
- **D-06:** Define the **full column-level schema for all 7 tables now** in one
  foundational migration: `users`, `accounts`, `sessions` (Better Auth core),
  plus `projects` (name + ticket-key + auto-increment counter column),
  `project_members` (role: owner|member), `invitations` (token + expiry),
  `tickets` (title, description, status enum, per-project `ticket_number`,
  assignee FK, GitHub branch fields). Later phases build features against an
  existing schema rather than churning migrations.
- **D-07:** Ticket status enum is locked by TKT-06:
  `backlog, todo, in_progress, in_review, done`.
- **D-08:** Enforce the per-project ticket-number uniqueness at the schema level
  now (unique constraint on `(project_id, ticket_number)`) so the Phase 5 atomic
  `UPDATE...RETURNING` counter has its guarantee in place. (Counter *logic* is
  Phase 5; the *constraint* lives in this foundational schema.)

### Auth UX & Landing
- **D-09:** Authenticated users land on a **minimal `/dashboard`** route showing
  a greeting, the user's email/name, GitHub-connected status, and a logout
  button. It becomes the project-list shell in Phase 2 — do not pre-build the
  project list here.
- **D-10:** Unauthenticated access to protected routes redirects to login.
  Logout must be reachable from any page and must clear the session; signed-in
  refresh must NOT bounce to login (success criteria 2-4).
- **D-11:** Signup validation uses Better Auth defaults + an **8-character
  minimum** password length, with a clear **inline error on duplicate email**.
  No custom complexity rules for v1.

### Claude's Discretion
- Session mechanism details (Better Auth's standard `sessions` table is created
  per the locked schema; cookie-cache/expiry tuning left to the planner unless a
  success criterion forces a choice).
- Exact migration tooling invocation (`drizzle-kit push` for dev vs
  `generate`+`migrate` for prod) — planner/researcher decides per the stack docs.
- Whether the protected-route guard is a layout-level server check or middleware
  redirect, given middleware is explicitly NOT the security boundary in this
  project (CVE-2025-29927) — implement as a server-side check.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack & Locked Constraints
- `CLAUDE.md` — full locked tech stack, version pins, and "What NOT to Use"
  table (Better Auth 1.6, split Neon drivers, `@neondatabase/serverless@^0.10.4`
  pin, bcryptjs/Edge constraints, neon-http "no transactions" limitation).
- `.planning/PROJECT.md` §Constraints + §Key Decisions — multi-tenant model,
  driver split rationale, connect-GitHub gate, per-user OAuth token decision.

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Authentication (AUTH-01..04) — the exact v1 auth
  requirements this phase satisfies; also the full table set this schema serves.
- `.planning/ROADMAP.md` §"Phase 1: Auth + Database Foundation" — goal + the 5
  success criteria (esp. criterion 5: all 7 tables exist via Drizzle migrations).

### Carried-Forward State (pitfalls & open questions)
- `.planning/STATE.md` §Accumulated Context — driver-split decision, the GitHub
  token-encryption open question (resolved here as D-03/D-04), and the Known
  Pitfalls list (neon-http transactions, token-not-in-JWT, counter race,
  `@neondatabase/serverless` pin) that constrain Phase 1 wiring.

*No external ADRs or standalone spec files exist in the repo — constraints are
fully captured in the documents above and in the decisions in this file.*

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — greenfield repo (only `README.md` and `CLAUDE.md` present). Phase 1
  scaffolds the Next.js app, so it establishes the foundational assets the rest
  of the project reuses.

### Established Patterns
- None in code yet. The pattern conventions to *establish* here: split Neon
  driver instances, a Better Auth server instance, a Drizzle schema module, and
  a server-side auth-guard helper (not middleware).

### Integration Points
- This phase creates the schema and auth surface every later phase builds on:
  Phase 2 (`requireProjectMember` against `project_members`), Phase 5 (ticket
  counter against `(project_id, ticket_number)`), Phase 7 (token accessor +
  scope elevation against `accounts`).

</code_context>

<specifics>
## Specific Ideas

- `/dashboard` as the single protected landing page for Phase 1, intentionally
  minimal (greeting + email + GitHub-connected status + logout) so it can grow
  into the Phase 2 project list without rework.
- Token-accessor function as the seam for future AES-256-GCM encryption.

</specifics>

<deferred>
## Deferred Ideas

- **AES-256-GCM encryption of the GitHub token** — deferred to Phase 7, when the
  token gains `repo`/`admin:repo_hook` scopes. Accessor seam (D-04) prepares for it.
- **Elevated GitHub OAuth scopes / "Connect GitHub" flow** — Phase 7 (GH-01).
- **Project list UI** — Phase 2; `/dashboard` placeholder is the seam.
- **Better Auth Organization plugin vs hand-rolled project tables** — open
  question owned by Phase 2 planning (per STATE.md), not resolved here.

None of these expanded Phase 1 scope — discussion stayed within the auth +
schema-foundation boundary.

</deferred>

---

*Phase: 1-Auth + Database Foundation*
*Context gathered: 2026-06-01*
