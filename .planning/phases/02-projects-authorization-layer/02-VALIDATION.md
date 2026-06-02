---
phase: 2
slug: projects-authorization-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-01
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 02-RESEARCH.md §Validation Architecture + §Security Domain.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 (established in Phase 1) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run src/tests/projects.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds (full suite, current size) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/tests/projects.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| PROJ-01 | T-data-integrity | `createProject` inserts project + owner member row **atomically** via `db.batch()` (no ownerless project on partial failure) | integration | `npx vitest run src/tests/projects.test.ts` | ❌ W0 | ⬜ pending |
| PROJ-01 | T-input-validation | Duplicate `ticketKey` returns a field-level error (Postgres `23505` caught), not a server crash | integration | `npx vitest run src/tests/projects.test.ts` | ❌ W0 | ⬜ pending |
| PROJ-01 | T-input-validation | Short/invalid `ticketKey` (< 2 chars, non-`/^[A-Z]{2,6}$/`) returns a validation error before any INSERT | integration | `npx vitest run src/tests/projects.test.ts` | ❌ W0 | ⬜ pending |
| PROJ-02 | — | Dashboard query returns projects for an **owner** AND for a **member** | integration | `npx vitest run src/tests/projects.test.ts` | ❌ W0 | ⬜ pending |
| PROJ-02 | — | Query returns 0 open / 0 resolved for a project with no tickets (conditional count, `cast(... as int)`) | integration | `npx vitest run src/tests/projects.test.ts` | ❌ W0 | ⬜ pending |
| PROJ-03 | T-IDOR | Non-member access to project detail throws `ProjectAccessError` (page maps to `notFound()`) | integration | `npx vitest run src/tests/projects.test.ts` | ❌ W0 | ⬜ pending |
| MEM-06 | T-IDOR / pitfall #3 | **`requireProjectMember` rejects BEFORE any project SELECT runs** (the 403-before-DB guarantee, success criterion #4) | integration | `npx vitest run src/tests/projects.test.ts` | ❌ W0 | ⬜ pending |
| MEM-06 | T-access-control | `requireProjectMember` accepts a **member** (not just owner) and returns `{ projectId, userId, role }` | integration | `npx vitest run src/tests/projects.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Critical test — authorization boundary (MEM-06 / pitfall #3):** verify that
`requireProjectMember` (1) throws before a subsequent `db.select()` on project
data would execute, and (2) rejects a user absent from `project_member`. This is
the 403-before-DB guarantee (roadmap success criterion #4).

---

## Wave 0 Requirements

- [ ] `src/tests/projects.test.ts` — covers PROJ-01, PROJ-02, PROJ-03, MEM-06 (8 cases above)
- [ ] Reuse the `src/tests/auth.test.ts` harness pattern: unique IDs per run; `afterEach` deletes created rows (FK `ON DELETE CASCADE` cleans `project_member` + `ticket`).

*Vitest framework already installed in Phase 1 — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Create-project Dialog opens, auto-uppercases the key as typed, closes on success, list re-renders | PROJ-01/PROJ-02 | Client interaction + revalidation timing not covered by integration tests | Run `npm run dev`, sign in, click "New project", type a lowercase key (see it uppercase), submit, confirm dialog closes and the new card appears with 0 open / 0 resolved |
| Project card shows correct owner/member role badge + key badge | PROJ-02 | Visual rendering | Create a project (owner badge), have a second account join (Phase 3) — deferred visual check |

*Server-side behaviors all have automated verification above.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`src/tests/projects.test.ts`)
- [ ] No watch-mode flags (use `vitest run`, never `vitest` watch)
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
