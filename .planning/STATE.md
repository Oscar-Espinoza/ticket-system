---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 1 — Auth + Database Foundation
current_plan: None (planning not yet started)
status: unknown
last_updated: "2026-06-01T18:39:11.926Z"
progress:
  total_phases: 9
  completed_phases: 0
  total_plans: 3
  completed_plans: 0
  percent: 0
---

# Project State: Linear-Clone Ticket System

**Last updated:** 2026-06-01
**Updated by:** roadmapper (new-project initialization)

---

## Project Reference

**Core value:** A ticket's status stays in sync with real GitHub work — create a branch from a ticket and merging its PR automatically marks the ticket done — without paying for any hosted service.

**Current focus:** Phase 1 — Auth + Database Foundation

---

## Current Position

**Milestone:** v1
**Current phase:** 1 — Auth + Database Foundation
**Current plan:** None (planning not yet started)
**Phase status:** Not started

```
Progress: [ 1 ][ 2 ][ 3 ][ 4 ][ 5 ][ 6 ][ 7 ][ 8 ][ 9 ]
           ^^^
           current
```

**Phases complete:** 0 / 9
**Requirements shipped:** 0 / 27

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases planned | 0 / 9 |
| Phases complete | 0 / 9 |
| Requirements complete | 0 / 27 |
| Plans complete | 0 / ? |

---

## Accumulated Context

### Decisions Made

| Decision | Phase | Rationale |
|----------|-------|-----------|
| Split Neon drivers: neon-http for app, neon-serverless for Better Auth | Phase 1 | neon-http can't do interactive transactions; Better Auth requires them |
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
| GitHub token encryption at rest | Phase 1 or 7 | Better Auth writes access_token as plaintext; decide during Phase 1 planning whether to accept plaintext for MVP or encrypt with AES-256-GCM |

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
- [ ] Decide on GitHub token encryption approach (before Phase 1 or Phase 7 planning)

---

## Session Continuity

**To resume work:** Read ROADMAP.md for phase goals and requirements, then run `/gsd:plan-phase 1` to begin planning Phase 1.

**Next action:** `/gsd:plan-phase 1`

---
*State initialized: 2026-06-01*
