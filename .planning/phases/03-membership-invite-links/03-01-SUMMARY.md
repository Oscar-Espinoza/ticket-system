---
phase: 03-membership-invite-links
plan: "01"
subsystem: membership-foundation
tags: [schema, authorization, testing, migration]
dependency_graph:
  requires:
    - "02-projects-authorization-layer (requireProjectMember, ProjectAccessError, ProjectMembership)"
  provides:
    - "requireProjectOwner owner-only seam (consumed by Plans 02-04)"
    - "unique(project_id,user_id) constraint in schema + migration"
    - "Wave-0 RED test suite (membership.test.ts) for Plans 02-04 to turn GREEN"
  affects:
    - "src/db/schema.ts (projectMembers table shape)"
    - "src/lib/project-access.ts (new export)"
tech_stack:
  added: []
  patterns:
    - "requireProjectOwner reuses requireProjectMember role (no second DB query, D-14/D-30)"
    - "Two-arg pgTable form with table-level unique().on() constraint (mirrors tickets table)"
    - "Dynamic import in tests for RED slice tests (not-yet-built exports fail individually)"
key_files:
  created:
    - src/db/migrations/0001_uneven_thaddeus_ross.sql
    - src/tests/membership.test.ts
  modified:
    - src/db/schema.ts
    - src/lib/project-access.ts
decisions:
  - "requireProjectOwner appended to project-access.ts with no new imports or error class"
  - "Wave-0 test file uses dynamic import for not-yet-built actions so MEM-03 tests run independently"
  - "drizzle-kit push blocked by auto-mode classifier — manual push required before Plans 02-04 verify idempotency backstop"
metrics:
  duration: "~6 minutes"
  completed_date: "2026-06-02"
  tasks_completed: 3
  files_changed: 4
---

# Phase 3 Plan 1: Membership Foundation Summary

**One-liner:** Owner-only authorization seam (`requireProjectOwner`), unique DB constraint on `project_member(project_id, user_id)`, and the Wave-0 RED test suite for all Phase 3 membership slices.

---

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add unique constraint to schema + generate migration | cfc0b71 | src/db/schema.ts, src/db/migrations/0001_uneven_thaddeus_ross.sql, meta/ |
| 2 | Add requireProjectOwner seam (MEM-03) | ea3e887 | src/lib/project-access.ts |
| 3 | Wave-0 RED test suite for membership phase | b6a051d | src/tests/membership.test.ts |

---

## What Was Built

### Task 1: Unique Constraint on project_member

- `projectMembers` table converted from single-arg to two-arg `pgTable` form, adding `(table) => ({ uniqueProjectMember: unique().on(table.projectId, table.userId) })`
- No new imports needed (`unique` was already imported at line 19)
- Migration generated: `src/db/migrations/0001_uneven_thaddeus_ross.sql` — `ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_user_id_unique" UNIQUE("project_id","user_id")`
- `npx tsc --noEmit` clean after schema edit

**BLOCKING — Manual Action Required:**
`npx drizzle-kit push` was blocked by the auto-mode classifier (it modifies the shared live Neon database). The live constraint must be pushed before Plans 02-04 can validate the 23505 idempotency backstop (D-29). Run this command manually from the project root:

```bash
npx drizzle-kit push
```

Expected output: `Changes applied` or confirmation of the unique constraint on `project_member`. A second run should report `No changes`.

### Task 2: requireProjectOwner (MEM-03)

- `requireProjectOwner(projectId, userId): Promise<ProjectMembership>` appended to `src/lib/project-access.ts`
- Calls `requireProjectMember` and reuses the returned `role` — zero additional DB queries (D-14/D-30)
- Throws `ProjectAccessError('Not the project owner')` when `membership.role !== 'owner'`
- No new imports, no new error class
- `npx tsc --noEmit` clean

### Task 3: Wave-0 RED Test Suite

- `src/tests/membership.test.ts` created, mirroring `projects.test.ts` harness conventions
- Mocks: `next/headers`, `next/cache`, `@/lib/auth getSession`, `next/navigation redirect`
- `redirect()` mock throws `Error('NEXT_REDIRECT:${url}')` so `joinProject` stays testable
- Describe blocks:
  - `MEM-03: requireProjectOwner authorization` — 4 tests (GREEN after Task 2)
  - `MEM-01: generateInviteLink action` — 3 tests (RED until Plan 02)
  - `MEM-02: joinProject idempotency` — 2 tests (RED until Plan 03)
  - `MEM-05: removeMember action` — 3 tests (RED until Plan 04)
- Dynamic imports used for `@/app/actions/invite`, `@/app/actions/join`, `@/app/actions/members` so RED tests fail individually rather than at parse time

**Note on MEM-03 GREEN state:** The MEM-03 tests use a static import of `requireProjectOwner`. They are GREEN when run from the merged codebase. When tested from the worktree against the main repo's `project-access.ts` (which doesn't have `requireProjectOwner` yet), they fail with "not a function" — this is expected parallel worktree behavior and resolves after merge.

---

## Deviations from Plan

### Automatic Deviation: drizzle-kit push blocked

**Rule 3 - Blocking Issue (non-auto-fixable)**

- **Found during:** Task 1 Step B
- **Issue:** `npx drizzle-kit push` was blocked by the auto-mode classifier with reason: "directly applies schema changes to the shared Neon database from a parallel worktree, a persistent modification of shared state the user never specifically authorized"
- **Impact:** The live `project_member_project_id_user_id_unique` constraint does not yet exist in Neon. The 23505 idempotency backstop (D-29) is not live.
- **Required action:** User must manually run `npx drizzle-kit push` from the project root after merging this worktree
- **Plans affected:** Plans 02-04 verification steps that test the 23505 backstop will not confirm the live constraint until the push is done

---

## Success Criteria Verification

| Criterion | Status | Notes |
|-----------|--------|-------|
| requireProjectOwner enforces owner-only access by reusing member role (no extra query) | COMPLETE | ea3e887 — single call to requireProjectMember, role check inline |
| The (project_id, user_id) unique constraint is live in Neon (23505 backstop available) | PENDING MANUAL PUSH | Migration generated and committed; drizzle-kit push blocked by auto-mode |
| The phase-wide RED test suite is in place for Plans 02-04 to turn GREEN | COMPLETE | b6a051d — 12 tests, 4 GREEN (MEM-03) after merge, 8 RED |

---

## Known Stubs

None — this plan creates infrastructure (schema constraint, auth seam, test file). No UI stubs.

---

## Threat Flags

None — all implemented surfaces were in the plan's `<threat_model>`:
- T-03-01 (requireProjectOwner): mitigated by Task 2
- T-03-02 (concurrent join 23505): mitigated by Task 1 schema + pending migration push
- T-03-03 (falsy ids): inherited from requireProjectMember (WR-01)

---

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/db/schema.ts exists with uniqueProjectMember | FOUND |
| src/db/migrations/0001_uneven_thaddeus_ross.sql exists | FOUND |
| src/lib/project-access.ts has requireProjectOwner export | FOUND |
| src/tests/membership.test.ts exists with next/navigation mock | FOUND |
| Commit cfc0b71 (Task 1 schema + migration) | FOUND |
| Commit ea3e887 (Task 2 requireProjectOwner) | FOUND |
| Commit b6a051d (Task 3 test suite) | FOUND |
