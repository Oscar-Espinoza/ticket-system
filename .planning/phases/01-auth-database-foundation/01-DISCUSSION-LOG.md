# Phase 1: Auth + Database Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 1-Auth + Database Foundation
**Areas discussed:** GitHub OAuth scopes, Token encryption at rest, Schema completeness, Auth UX & landing

---

## GitHub OAuth Scopes

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal at login, elevate later | Request only `read:user` + `user:email` at login; repo scopes via Connect GitHub (Phase 7). Uniform, least-privilege, matches connect-github gate. | ✓ |
| Full repo scopes at login | Request `repo` + `admin:repo_hook` immediately. GitHub-login users skip connect step but email/password users still need it; scary consent at signup. | |
| You decide | Let Claude pick recommended. | |

**User's choice:** Minimal at login, elevate later
**Notes:** Stored token has no repo access in Phase 1; both login types converge on the Phase 7 Connect-GitHub re-consent.

---

## Token Encryption at Rest

| Option | Description | Selected |
|--------|-------------|----------|
| Plaintext for MVP, encrypt-ready | Accept Better Auth plaintext default for v1; isolate token reads behind an accessor so AES-256-GCM in Phase 7 is localized. | ✓ |
| AES-256-GCM from day one | Encrypt access_token with AES-256-GCM + key mgmt starting Phase 1, before token carries repo access. | |
| Plaintext, revisit in Phase 7 | Plain default, no abstraction; do all encryption work in Phase 7. | |

**User's choice:** Plaintext for MVP, encrypt-ready
**Notes:** Resolves the STATE.md open question ("GitHub token encryption at rest — Phase 1 or 7"). Token only holds `read:user`/`user:email` until Phase 7, so plaintext is acceptable for v1; accessor seam prepares for encryption.

---

## Schema Completeness

| Option | Description | Selected |
|--------|-------------|----------|
| Full schema, all columns now | Define every column for all 7 tables in one foundational migration; later phases build features, no migration churn. | ✓ |
| Auth tables full, rest stubbed | Fully build users/accounts/sessions; stub projects/tickets/etc. and ALTER per feature phase. | |
| You decide | Let Claude choose. | |

**User's choice:** Full schema, all columns now
**Notes:** Matches the goal's "complete schema" wording. Status enum locked by TKT-06; `(project_id, ticket_number)` unique constraint included now to back the Phase 5 atomic counter.

---

## Auth UX & Landing

### Landing page

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal `/dashboard` placeholder | Greeting + email/name + GitHub-connected status + logout. Satisfies criteria 2-4; becomes Phase 2 project-list shell. | ✓ |
| Projects-list shell | Build empty projects list now — risks Phase 2 scope bleed. | |
| Bare "you are logged in" page | Text + logout only; throws away more work in Phase 2. | |

**User's choice:** Minimal `/dashboard` placeholder

### Password rules

| Option | Description | Selected |
|--------|-------------|----------|
| Better Auth defaults + 8-char min | Built-in email-format + password handling, 8-char minimum, inline duplicate-email error. Low friction. | ✓ |
| Stronger policy (12+ chars, complexity) | 12+ chars + mixed classes. More secure, higher friction; overkill for v1. | |
| You decide | Let Claude pick. | |

**User's choice:** Better Auth defaults + 8-char min
**Notes:** Server-side auth guard (not middleware) per CVE-2025-29927 constraint.

---

## Claude's Discretion

- Session cookie-cache/expiry tuning (standard Better Auth `sessions` table created per locked schema).
- Migration tooling invocation (`drizzle-kit push` dev vs `generate`+`migrate` prod).
- Protected-route guard implemented as a server-side check rather than middleware.

## Deferred Ideas

- AES-256-GCM token encryption → Phase 7 (accessor seam prepared).
- Elevated GitHub scopes / Connect GitHub flow → Phase 7 (GH-01).
- Project list UI → Phase 2 (`/dashboard` is the seam).
- Better Auth Organization plugin vs hand-rolled project tables → open question owned by Phase 2 planning.
