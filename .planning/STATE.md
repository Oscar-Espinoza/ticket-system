---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 03
current_plan: 1
status: gaps_found
last_updated: "2026-06-02T03:28:54.346Z"
progress:
  total_phases: 9
  completed_phases: 2
  total_plans: 11
  completed_plans: 7
  percent: 22
---

# Project State: Linear-Clone Ticket System

**Last updated:** 2026-06-01
**Updated by:** roadmapper (new-project initialization)

---

## Project Reference

**Core value:** A ticket's status stays in sync with real GitHub work — create a branch from a ticket and merging its PR automatically marks the ticket done — without paying for any hosted service.

**Current focus:** Phase 03 — membership-invite-links

---

## Current Position

Phase: 03 (membership-invite-links) — EXECUTING
Plan: 1 of 4
**Milestone:** v1
**Current phase:** 03
**Current plan:** 1
**Phase status:** Gaps Found — 4/4 plans built, verification found 1 gap (MEM-02 logged-out join path); run gap closure before completing

```
Progress: [ 1 ][ 2 ][ 3 ][ 4 ][ 5 ][ 6 ][ 7 ][ 8 ][ 9 ]
            ✓   ^^^
                next
```

**Phases complete:** 1 / 9
**Requirements shipped:** 4 / 27 (AUTH-01, AUTH-02, AUTH-03, AUTH-04)

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases planned | 1 / 9 |
| Phases complete | 1 / 9 |
| Requirements complete | 4 / 27 |
| Plans complete | 3 / 3 (Phase 1) |

### Execution log

| Phase-Plan | Duration | Tasks | Files | Result |
|-----------|----------|-------|-------|--------|
| 01-01 | — | — | — | Scaffold + DB foundation (complete) |
| 01-02 | ~11m | 2 | 23 | Email/password auth slice + protected dashboard (complete) |
| 01-03 | ~4m | 1 (+1 manual gate) | 6 | GitHub OAuth slice, minimal scopes, token seam (complete) |

---

## Accumulated Context

### Decisions Made

| Decision | Phase | Rationale |
|----------|-------|-----------|
| Split Neon drivers: neon-http for app, neon-serverless for Better Auth | Phase 1 | neon-http can't do interactive transactions; Better Auth requires them |
| Server-side layout `getSession` guard as the protected-route boundary (not middleware) | Phase 1 | CVE-2025-29927 lets middleware be bypassed; `dashboard/layout.tsx` is the reusable pattern |
| Better Auth drizzle adapter gets an explicit singular-keyed `authSchema` alias | Phase 1 | Adapter resolves `schema[modelName]` with singular keys; shared schema keeps plural exports for app code |
| Pin `kysely@0.28.17` | Phase 1 | kysely 0.29 moved DEFAULT_MIGRATION_* off the package root; @better-auth/kysely-adapter@1.6.13 still imports them from root |
| shadcn `radix-nova` preset (shadcn 4.x successor to new-york) | Phase 1 | shadcn 4.x replaced named styles with presets; radix-nova matches UI-SPEC (Radix + Lucide + Geist) |
| Pin `@neondatabase/serverless@^0.10.4` | Phase 1 | v1.0.0 broke drizzle-orm/neon-http (open bug #5208) |
| `requireProjectMember()` DAL helper as the security boundary | Phase 2 | Middleware is not a security boundary (CVE-2025-29927); DAL enforces per-project auth |
| Shareable invite link, no email | Phase 3 | Avoids email provider; stays free-tier |
| Atomic `UPDATE...RETURNING` for ticket counter | Phase 5 | Race-safe per-project identifiers without multi-statement transactions |
| Per-user GitHub OAuth token for branch creation (never in session JWT) | Phase 7 | Correct multi-tenant attribution; token fetched from accounts table at action time |
| Raw body read before HMAC verification in webhook handler | Phase 8 | `request.json()` consumes the body stream; re-serializing breaks the hash |
| Exclude `/api/webhooks/*` from middleware matcher | Phase 8 | Webhook has no session cookie; middleware would return 401/302 |
| Use Next.js `after()` to defer webhook DB work | Phase 8 | Vercel Hobby 10s timeout; respond 200 immediately, defer state transitions |

### Open Questions

| Question | Phase | Notes |
|----------|-------|-------|
| Better Auth Organization plugin vs hand-rolled project tables | Phase 2 | Plugin defaults to emailed invites — need to verify if copy-paste link flow is achievable without email transport |

**Resolved:**
| Question | Phase | Resolution |
|----------|-------|------------|
| GitHub token encryption at rest | Phase 1 | RESOLVED (D-03/D-04): accept plaintext for v1 (token carries only read:user/user:email until Phase 7); all token reads isolated behind `getGitHubToken()` (src/lib/github-token.ts) as the single seam for AES-256-GCM encryption in Phase 7. |

### Known Pitfalls

All from research — must be verified with tests during implementation:

1. Webhook route blocked by auth middleware — exclude `/api/webhooks/*` from matcher
2. `request.json()` before HMAC — always `req.text()` first
3. IDOR from missing `requireProjectMember()` — DAL helper on every scoped action
4. GitHub token in session JWT — only store `githubConnected: boolean` in session
5. Ticket counter race — single `UPDATE...RETURNING`, unique constraint on `(project_id, ticket_number)`
6. Vercel 10s timeout on webhook — use `after()` + idempotency key on `X-GitHub-Delivery`
7. `@neondatabase/serverless@^0.10.4` pin — do not upgrade without checking drizzle-orm#5208

### Blockers

None.

### Todos

- [ ] Resolve open question: Better Auth Organization plugin vs hand-rolled project tables (before Phase 2 planning)
- [x] Decide on GitHub token encryption approach — resolved D-03/D-04 (plaintext v1, encrypt in Phase 7 via getGitHubToken seam)

---

## Session Continuity

**Last session:** 2026-06-02T02:52:18.810Z

**To resume work:** Plan Phase 2 (Projects + membership). Before planning, resolve the open question: Better Auth Organization plugin vs hand-rolled project tables (copy-paste invite link without email transport).

**Next action:** `/gsd:plan-phase 2`

---
*State initialized: 2026-06-01*
