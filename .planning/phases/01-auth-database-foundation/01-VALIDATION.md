---
phase: 1
slug: auth-database-foundation
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-01
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (Wave 0 installs — recommended by RESEARCH.md) |
| **Config file** | none — Wave 0 installs (`vitest.config.ts`) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01-01 | 1 | AUTH-01..04 (scaffold) | T-01-SC | pinned `@neondatabase/serverless@^0.10.4`, no Edge runtime | infra | `npm run build && npm run lint && npx vitest --version` | ❌ W0 | ⬜ pending |
| 01-01-T2 | 01-01 | 1 | AUTH-01..04 (schema) | T-01-02 / T-01-03 | dual driver (neon-http app + neon-serverless auth), parameterized Drizzle | unit | `npx tsc --noEmit && grep -c "pgTable" src/db/schema.ts` | ❌ W0 | ⬜ pending |
| 01-01-T3 | 01-01 | 1 | AUTH-04 (migration) | T-01-01 | 7 tables applied to live Neon | manual+CLI | `ls src/db/migrations/*.sql` | ❌ W0 | ⬜ pending |
| 01-02-T1 | 01-02 | 2 | AUTH-01/03/04 (RED) | — | tests fail before impl exists | integration (RED) | `npx vitest run src/__tests__/auth.test.ts src/__tests__/routing.test.ts; test $? -ne 0` | ❌ W0 | ⬜ pending |
| 01-02-T2 | 01-02 | 2 | AUTH-01/03/04 (GREEN) | T-01-04/05/06/08 | bcryptjs Node runtime, server-side `getSession` guard (CVE-2025-29927), session-fixation safe | integration (GREEN) | `npx vitest run && npm run build && npm run lint` | ❌ W0 | ⬜ pending |
| 01-03-T1 | 01-03 | 3 | AUTH-02 (OAuth wiring) | T-01-09/10/12 | minimal OAuth scopes, token never in JWT/client | integration | `npx vitest run && npm run build && npm run lint && grep -L "admin:repo_hook" src/lib/auth.ts` | ❌ W0 | ⬜ pending |
| 01-03-T2 | 01-03 | 3 | AUTH-02 (smoke) | T-01-11 | end-to-end GitHub sign-in → dashboard | manual | `npm run build` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> Map populated from plan `<verify>` blocks at plan time. The gsd-nyquist-auditor reconciles `File Exists` and `Status` after execution; `wave_0_complete` flips true once vitest infra (01-01-T1) lands.

---

## Wave 0 Requirements

- [ ] `vitest` + `@vitejs/plugin-react` install — if no framework detected
- [ ] `vitest.config.ts` — test runner config
- [ ] Test stubs for AUTH-01..04 behaviors

*Auth flows that depend on a live Neon DB and GitHub OAuth may require integration-level setup; see Manual-Only Verifications.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub OAuth sign-in → protected dashboard | AUTH-02 | Requires real GitHub OAuth app + browser redirect flow | Configure GitHub OAuth app, click "Sign in with GitHub", confirm landing on `/dashboard` |
| Session persists across browser refresh | AUTH-03 | Requires real browser session cookie behavior | Sign in, refresh `/dashboard`, confirm no redirect to login |
| Neon migrations applied (all 7 tables exist) | AUTH-04 | Requires live Neon connection | Run `drizzle-kit migrate`, inspect Neon dashboard / `\dt` |

*Automated unit tests cover password hashing, schema definitions, and auth config wiring; live-DB and OAuth-redirect behaviors are manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-01 (plan-level Nyquist contract satisfied; `wave_0_complete` flips at execution)
