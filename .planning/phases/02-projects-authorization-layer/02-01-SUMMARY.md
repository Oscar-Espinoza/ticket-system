---
phase: 02-projects-authorization-layer
plan: 01
subsystem: auth
tags: [drizzle, neon-http, vitest, shadcn, authorization, dal, project-access]

# Dependency graph
requires:
  - phase: 01-auth-database-foundation
    provides: db (neon-http), authDb (neon-serverless), users table, projectMembers table, schema.ts, github-token.ts accessor pattern

provides:
  - requireProjectMember DAL helper (src/lib/project-access.ts) — the single authorization seam for all project-scoped server functions
  - ProjectAccessError class — typed domain error for non-member access, used by all Phase 2/3/4 pages and actions
  - ProjectMembership type — { projectId, userId, role } returned on success, enables Phase 3/4 requireProjectOwner without extra query
  - Wave 0 test suite (src/tests/projects.test.ts) — 9 it() blocks covering PROJ-01/02/03 + MEM-06; 4 GREEN now (MEM-06 + PROJ-03), 5 RED until Plans 02/03
  - shadcn Dialog primitive (src/components/ui/dialog.tsx) — prerequisite for Plan 02 create-project dialog

affects: [02-02, 02-03, 02-04, 03-invitation-layer, 04-project-settings, 05-ticket-crud]

# Tech tracking
tech-stack:
  added: [shadcn dialog component (source copy via npx shadcn@latest add dialog)]
  patterns:
    - "requireProjectMember throw-before-read: membership SELECT runs BEFORE any project-scoped SELECT (403-before-DB, MEM-06, T-02-01 mitigation)"
    - "ProjectAccessError instanceof pattern: callers use instanceof to map to notFound() on pages or returned error on actions (D-15)"
    - "Minimal-column DAL select: select only { projectId, userId, role } — mirrors github-token.ts convention"
    - "Dynamic test imports: later-plan exports imported inside test bodies so MEM-06 tests can run independently in Wave 0"

key-files:
  created:
    - src/lib/project-access.ts
    - src/tests/projects.test.ts
    - src/components/ui/dialog.tsx
  modified: []

key-decisions:
  - "Dynamic imports in Wave 0 test file — top-level imports for @/app/actions/projects and @/components/project-list would fail at parse time preventing MEM-06 tests from running; moved to inside test bodies so filter (-t MEM-06) still works"
  - "requireProjectMember returns role (not just boolean) per D-14 — enables Phase 3/4 requireProjectOwner with zero additional DB queries"

patterns-established:
  - "Pattern 1: server-only DAL helper in src/lib/ — throws domain error before any project data access (mirrors github-token.ts shape + adds typed error)"
  - "Pattern 2: Wave 0 RED test suite with dynamic imports — static imports for later-plan exports cause full-file failure; dynamic imports allow sub-suite filtering"

requirements-completed: [MEM-06]

# Metrics
duration: ~5min
completed: 2026-06-02
---

# Phase 02 Plan 01: Foundation Summary

**`requireProjectMember` DAL helper with `ProjectAccessError` class establishes the 403-before-DB authorization seam; Wave 0 test suite seeds 9 integration tests with 4 immediately GREEN (MEM-06 + PROJ-03)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-02T01:22:53Z
- **Completed:** 2026-06-02T01:28:43Z
- **Tasks:** 3
- **Files modified:** 3 created

## Accomplishments

- `src/lib/project-access.ts` implements `requireProjectMember` that selects the project_member row first and throws `ProjectAccessError` before any project-scoped SELECT — the 403-before-DB guarantee (MEM-06, T-02-01)
- `src/tests/projects.test.ts` with 9 `it()` blocks (all 8 validation map cases + one shared PROJ-03/MEM-06) is in the correct Wave 0 state: 4 tests GREEN (3 MEM-06 + 1 PROJ-03), 5 tests RED (PROJ-01 × 3, PROJ-02 × 2) pending Plans 02/03
- `src/components/ui/dialog.tsx` added via shadcn CLI — exports Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogOverlay, DialogPortal, DialogTrigger; no new npm dependencies

## Task Commits

1. **Task 1: Add shadcn dialog component** - `7cb7c8e` (chore)
2. **Task 2: Write failing Wave 0 test suite** - `f3eb85e` (test)
3. **Task 3: Implement requireProjectMember DAL helper** - `207b478` (feat — also fixes Task 2 test to use dynamic imports)

## Files Created/Modified

- `src/lib/project-access.ts` — requireProjectMember async function, ProjectAccessError class, ProjectMembership type; server-only DAL mirroring github-token.ts shape
- `src/tests/projects.test.ts` — Wave 0 integration test suite with beforeAll DATABASE_URL guard, afterEach cleanup via inArray, unique ticketKey/email per run, 9 it() blocks
- `src/components/ui/dialog.tsx` — shadcn Dialog primitive copied from official registry via CLI

## Decisions Made

**Dynamic imports for not-yet-existing modules in Wave 0 tests:**
The plan specified "do NOT stub the imports — the suite must genuinely fail." Static top-level imports for `@/app/actions/projects` and `@/components/project-list` caused full file parse failure, preventing the MEM-06 tests (which only need `@/lib/project-access`) from running at all. Moving the failing imports inside the test bodies via `await import(...)` preserves the RED state for PROJ-01/02 while allowing `npx vitest run -t "MEM-06"` to exit 0. This is the minimum change to satisfy both "suite is RED" and "MEM-06 tests are GREEN" requirements.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test import strategy to allow MEM-06 GREEN verification**
- **Found during:** Task 3 (implementing requireProjectMember)
- **Issue:** Static top-level imports for `createProject` and `getProjectsForUser` caused entire test file to fail at parse time (Cannot find package error), making `npx vitest run -t "MEM-06"` impossible to run. The plan's acceptance criteria requires both "suite is RED" AND "MEM-06 tests exit 0."
- **Fix:** Changed static top-level imports of not-yet-existing modules to dynamic `await import(...)` inside each test body. The imports still fail when those tests run (RED), but MEM-06 tests can now run independently.
- **Files modified:** `src/tests/projects.test.ts`
- **Verification:** `npx vitest run src/tests/projects.test.ts -t "MEM-06"` exits 0 with 3 passed; full suite run shows 5 failed (expected RED for PROJ-01/02) and 4 passed (MEM-06 × 3 + PROJ-03 × 1).
- **Committed in:** `207b478` (part of Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required for correctness — without this fix the Task 3 acceptance criterion "MEM-06 tests exit 0" could not be verified. No scope creep.

## Issues Encountered

The worktree didn't have `.env.local` (it's in the main repo root, gitignored). The dotenv setup in `src/tests/setup.ts` uses `path: '.env.local'` relative to CWD. Created a symlink from the worktree to the main repo's `.env.local` so tests could access DATABASE_URL. The symlink is already covered by `.gitignore` and was not committed.

## Next Phase Readiness

- `requireProjectMember` is ready for immediate use by Plan 02 (createProject action) and Plan 03 (project-list, project detail page)
- Wave 0 test suite is in the correct RED state — Plans 02 and 03 implement against it
- Dialog component is installed and ready for Plan 02's create-project dialog

No blockers for Plan 02.

---
*Phase: 02-projects-authorization-layer*
*Completed: 2026-06-02*
