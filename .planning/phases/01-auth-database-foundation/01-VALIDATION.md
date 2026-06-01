---
phase: 1
slug: auth-database-foundation
status: draft
nyquist_compliant: false
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
| TBD | — | — | AUTH-01..04 | — | populated by planner | unit/integration | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> The planner fills this map per task during PLAN.md generation. The gsd-nyquist-auditor reconciles it after execution.

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

**Approval:** pending
