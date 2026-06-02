---
phase: 02-projects-authorization-layer
plan: 02
subsystem: api
tags: [server-actions, drizzle, neon-http, react, shadcn, useActionState, postgres]

# Dependency graph
requires:
  - phase: 02-01
    provides: requireProjectMember DAL helper, ProjectAccessError, projects+projectMembers schema, dialog UI component
provides:
  - createProject Server Action with atomic db.batch insert and 23505 error mapping
  - CreateProjectState type for form state
  - CreateProjectDialog client component using useActionState
  - Updated projects.test.ts with PROJ-01 mocking (next/headers, next/cache, @/lib/auth)
affects:
  - "02-03 (dashboard wiring — imports CreateProjectDialog and ProjectList)"
  - "02-04+ (any plan that calls createProject or uses CreateProjectState type)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "'use server' Server Action with useActionState client pairing"
    - "db.batch([insert A, insert B]) for atomic two-row insert on neon-http (no interactive transactions)"
    - "Postgres SQLSTATE 23505 detection via (err as {code?:string}).code for inline field errors"
    - "vi.mock('next/headers') + vi.mock('@/lib/auth') for Server Action testing in vitest"

key-files:
  created:
    - src/app/actions/projects.ts
    - src/components/create-project-dialog.tsx
    - src/tests/projects.test.ts
    - vitest.config.ts
  modified: []

key-decisions:
  - "D-16/D-17/D-18 implemented as specified: Dialog trigger (not route), server-side regex validation, db.batch atomicity"
  - "Test mocking strategy: vi.mock next/headers + auth.api.getSession with a real DB user (SESSION_USER_ID inserted in beforeAll) allows PROJ-01 tests to pass in vitest without a running Next.js server"
  - "vitest.config.ts created in worktree to point @ alias to worktree src/ for test resolution in isolated worktree context"

patterns-established:
  - "Server Action pattern: 'use server' + useActionState in client — do NOT use authClient for mutations"
  - "Atomic two-row insert: always db.batch([insert project, insert project_member]) — sequential awaits create ownerless-project risk"
  - "23505 handling: check (err as {code?:string}).code not err.message (locale-independent)"
  - "Server Action testing: mock next/headers + auth.api.getSession + next/cache; insert real DB user for FK-constrained inserts"

requirements-completed: [PROJ-01]

# Metrics
duration: ~22min
completed: 2026-06-01
---

# Phase 2 Plan 02: Create-Project Vertical Slice Summary

**createProject Server Action with atomic db.batch insert (project + owner member), 23505 inline error, and CreateProjectDialog useActionState client component with ticket-key auto-uppercase transform**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-06-01T18:32:00Z
- **Completed:** 2026-06-01T18:43:00Z
- **Tasks:** 2
- **Files created:** 4 (projects.ts, create-project-dialog.tsx, projects.test.ts, vitest.config.ts)

## Accomplishments

- `createProject` Server Action validates inputs, atomically inserts project + owner project_member via `db.batch()`, maps Postgres `23505` to inline `ticketKey` field error, re-throws unexpected errors, and revalidates `/dashboard` on success
- `CreateProjectDialog` client component uses `useActionState(createProject, initialState)`, controlled ticket-key input with per-keystroke A-Z transform, inline field errors via `aria-describedby`, Loader2 pending state, and `useEffect` close-on-success
- PROJ-01 integration tests (3/3) GREEN: atomic insert, duplicate-key field error, invalid-key validation — achieved by adding `vi.mock` for `next/headers`, `next/cache`, and `@/lib/auth` with a real DB user as the session subject
- MEM-06 (3/3) and PROJ-03 (1/1) tests remain GREEN; PROJ-02 tests remain RED pending Plan 03

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement createProject Server Action (atomic db.batch + 23505)** - `e231a86` (feat)
2. **Task 2: Build the CreateProjectDialog client component + PROJ-01 test mocking** - `89c7ee8` (feat)

**Plan metadata:** (docs commit after SUMMARY.md)

## Files Created/Modified

- `src/app/actions/projects.ts` — 'use server' createProject action: session guard, name/ticketKey validation, db.batch atomic insert, 23505 catch, revalidatePath('/dashboard'), return { success: true }
- `src/components/create-project-dialog.tsx` — 'use client' CreateProjectDialog: useActionState, controlled ticketKey state with toUpperCase/replace/slice transform, sr-only DialogDescription, aria-describedby error wiring, Loader2 pending button, useEffect close-on-success
- `src/tests/projects.test.ts` — updated Wave 0 test file with vi.mock for next/headers, next/cache, @/lib/auth; beforeAll/afterAll for SESSION_USER_ID user row; PROJ-01 tests track created projects for cleanup
- `vitest.config.ts` — worktree-local config pointing @ alias to worktree src/ for test resolution

## Decisions Made

- Added `vi.mock` for `next/headers`, `next/cache`, and `@/lib/auth` to the test file to make PROJ-01 tests runnable via vitest without a Next.js server context. The mock session user (`SESSION_USER_ID`) is inserted as a real DB row in `beforeAll` so FK constraints on `project.ownerId` and `project_member.userId` resolve correctly.
- Created `vitest.config.ts` as a real file (not symlink) in the worktree to ensure the `@` alias resolves to the worktree's own `src/` directory when running tests in isolated worktree context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added next/headers + auth mocking to projects.test.ts for PROJ-01 vitest compatibility**
- **Found during:** Task 1 verification (`npx vitest run src/tests/projects.test.ts -t "PROJ-01"`)
- **Issue:** `next/headers`'s `headers()` function throws "was called outside a request scope" when invoked in a vitest node environment. The PROJ-01 tests call `createProject()` which calls `auth.api.getSession({ headers: await headers() })` — this throws before any test assertion runs.
- **Fix:** Added `vi.mock('next/headers', ...)`, `vi.mock('next/cache', ...)`, and `vi.mock('@/lib/auth', ...)` at the top of `projects.test.ts`. Added `beforeAll`/`afterAll` to insert/clean up the `SESSION_USER_ID` user row so DB FK constraints on owner IDs resolve to a real user. Updated PROJ-01 tests to track created project IDs for cleanup.
- **Files modified:** `src/tests/projects.test.ts`
- **Verification:** `npx vitest run src/tests/projects.test.ts -t "PROJ-01"` exits 0 (3/3 GREEN)
- **Committed in:** `89c7ee8` (Task 2 commit)

**2. [Rule 3 - Blocking] Created worktree-local vitest.config.ts for worktree src/ alias resolution**
- **Found during:** Task 1 verification — tests ran from worktree but couldn't resolve `@/app/actions/projects`
- **Issue:** The symlinked `vitest.config.ts` (pointing to main project's config) resolves `import.meta.url` to the main project location, so the `@` alias pointed to main's `src/` instead of worktree's `src/`.
- **Fix:** Removed the vitest.config.ts symlink and created a real copy in the worktree with identical content (the `@` alias correctly resolves to worktree's `src/` via `import.meta.url`).
- **Files modified:** `vitest.config.ts` (new real file in worktree)
- **Committed in:** `89c7ee8` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking — test infrastructure setup)
**Impact on plan:** Both fixes necessary to satisfy the plan's acceptance criteria (PROJ-01 tests must pass via vitest). No scope creep. MEM-06 and PROJ-03 tests unaffected.

## Known Stubs

None — `createProject` validates, inserts, and revalidates in full. `CreateProjectDialog` is fully wired to the action. Dashboard wiring (rendering the dialog in `dashboard/page.tsx`) is Plan 03's responsibility.

## Threat Flags

No new threat surface beyond what's documented in the plan's `<threat_model>`:
- T-02-03: Ownerless project — mitigated by `db.batch()`
- T-02-04: Ticket-key injection — mitigated by `/^[A-Z]{2,6}$/` server-side test
- T-02-05: Session spoofing — creator id from `auth.api.getSession`, never client input
- T-02-06: Unexpected DB errors — re-thrown, never swallowed

## Issues Encountered

The PROJ-01 integration tests as written in plan 01's Wave 0 test file required a real Next.js server context to call `headers()`. This was not discovered in plan 01 because the tests were RED due to module absence. The fix (mocking strategy) makes the tests properly self-contained.

## Next Phase Readiness

- `createProject` and `CreateProjectState` are ready for import in any server or client code
- `CreateProjectDialog` is ready to be dropped into `dashboard/page.tsx` (Plan 03)
- PROJ-01 tests are GREEN and will remain stable post-merge
- PROJ-02 tests remain RED — they require `getProjectsForUser` from `project-list.tsx` (Plan 03)

---
*Phase: 02-projects-authorization-layer*
*Completed: 2026-06-01*
