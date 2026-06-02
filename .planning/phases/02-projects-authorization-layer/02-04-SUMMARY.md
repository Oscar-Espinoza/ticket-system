---
phase: 02-projects-authorization-layer
plan: 04
subsystem: ui
tags: [nextjs, react, authorization, server-component, drizzle, better-auth, shadcn]

# Dependency graph
requires:
  - phase: 02-projects-authorization-layer
    plan: 01
    provides: requireProjectMember DAL helper + ProjectAccessError from src/lib/project-access.ts

provides:
  - Project detail Server Component at /dashboard/projects/[id] guarded by requireProjectMember
  - Enumeration-resistant 404 for non-members (notFound() before any project SELECT)
  - Project header (name h1 + ticket-key Badge) + empty ticket-list placeholder

affects:
  - Phase 3 (invite links) — detail page is the landing after accepting an invite
  - Phase 5 (ticket CRUD) — the New-ticket button and ticket list slot into this page shell

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Next.js 15 async params: const { id } = await params in dynamic route segments"
    - "requireProjectMember-before-DB ordering: authorization DAL call precedes all project-scoped SELECTs"
    - "notFound() re-throw pattern: if (err instanceof ProjectAccessError) notFound(); throw err — prevents swallowing control-flow exception"
    - "Enumeration-resistant 404: non-member gets notFound() (not 403) so project IDs are not confirmed"

key-files:
  created:
    - src/app/dashboard/projects/[id]/page.tsx
  modified: []

key-decisions:
  - "D-15 honored: detail page uses notFound() (404) for non-members, not forbidden() or 403, so project existence is not confirmed to outsiders"
  - "D-21 honored: no New-ticket button or CTA rendered — deferred to Phase 5, no non-functional controls shipped"
  - "requireProjectMember is the first call on the page, before any project SELECT, satisfying the 403-before-DB guarantee (MEM-06)"

patterns-established:
  - "notFound() re-throw: always re-throw non-ProjectAccessError errors inside the authorization catch block"
  - "Authorization-first page pattern: session check → requireProjectMember → project SELECT → render"

requirements-completed: [PROJ-03, MEM-06]

# Metrics
duration: 8min
completed: 2026-06-01
---

# Phase 2 Plan 04: Project Detail Page Summary

**Next.js 15 Server Component at /dashboard/projects/[id] with requireProjectMember-first authorization: non-members receive enumeration-resistant 404 before any project row is read**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-01T18:30:00Z
- **Completed:** 2026-06-01T18:38:00Z
- **Tasks:** 1 (TDD — GREEN phase; RED already committed in Wave 0 Plan 01)
- **Files modified:** 1 created

## Accomplishments

- Created `src/app/dashboard/projects/[id]/page.tsx` as an async Server Component with async params (Next.js 15)
- requireProjectMember called FIRST before any project SELECT — 403-before-DB guarantee enforced (MEM-06, success criterion #4)
- ProjectAccessError maps to notFound() (404) so non-members cannot confirm a project's existence (D-15, T-02-10)
- Non-domain errors are re-thrown in catch block so notFound()'s control-flow exception propagates correctly (T-02-11)
- Page renders project header (name as h1 + ticketKey as secondary font-mono Badge) and empty ticket placeholder Card
- No New-ticket button or CTA rendered (D-21 — deferred to Phase 5)
- PROJ-03 and MEM-06 tests pass; no new TypeScript errors introduced

## Task Commits

1. **Task 1: Build the guarded project detail page** - `d699d32` (feat)

**Plan metadata:** (committed with SUMMARY.md)

## Files Created/Modified

- `src/app/dashboard/projects/[id]/page.tsx` — Async Server Component: session check → requireProjectMember → project SELECT → render project header + empty ticket placeholder

## Decisions Made

- Followed D-15: used `notFound()` (not `forbidden()`) for non-members — enumeration-resistant (project existence not confirmed)
- Followed D-21: rendered no New-ticket button — deferred to Phase 5; ship no non-functional controls
- Authorization ordering preserved: `requireProjectMember(id, session.user.id)` executes before `db.select().from(projects)` on every request

## Deviations from Plan

### Pre-existing TypeScript errors (not introduced by this plan)

The test file `src/tests/projects.test.ts` (committed in Plan 01 Wave 0) contains dynamic imports for `@/app/actions/projects` (Plan 02) and `@/components/project-list` (Plan 03) that produce TypeScript errors when those modules don't yet exist. These errors were present before this plan's execution and are a known consequence of the Wave 0 test-first design. The page file itself has no TypeScript errors. The errors resolve when Plans 02 and 03 ship their modules.

**No Rule 1/2/3/4 deviations were required.** The plan executed exactly as specified.

## Issues Encountered

- Worktree did not have the main branch content on startup (only had README.md). Merged main into the worktree branch via `git merge main` to get all source files before implementation. This is expected worktree initialization behavior, not a blocking issue.
- `.env.local` was not present in the worktree directory. Created a symlink to the main repo's `.env.local` so vitest could load DATABASE_URL for the integration tests.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced. The detail page reads from existing `projects` and `project_member` tables. The threat model mitigations in the PLAN.md are all implemented:

- T-02-10: `requireProjectMember` is the FIRST authorization call; on failure `notFound()` (not 403) — MITIGATED
- T-02-11: Non-domain errors re-thrown in catch block — MITIGATED
- T-02-12: Authorization in Server Component, not middleware; no `forbidden()`/`authInterrupts` — MITIGATED

## Known Stubs

None. The page's empty ticket list is intentional per D-21 — the ticket feature is deferred to Phase 5. This is documented design, not a stub.

## Next Phase Readiness

- Project detail page is complete and guarded
- Phase 3 (invite links) can use `/dashboard/projects/[id]` as the post-accept landing page
- Phase 5 will add the New-ticket button and ticket CRUD into this page shell
- The page shell structure (`container mx-auto max-w-4xl px-6 py-8`) is the seam for Phase 5 content

## Self-Check

- [x] `src/app/dashboard/projects/[id]/page.tsx` created and committed at `d699d32`
- [x] `requireProjectMember` called before `db.select().from(projects)` in page
- [x] `catch` block maps `ProjectAccessError` to `notFound()` and re-throws non-domain errors
- [x] `npx vitest run src/tests/projects.test.ts -t "PROJ-03"` exits 0
- [x] No new TypeScript errors in source files (pre-existing test file errors excluded)
- [x] No `forbidden()` import, no `authInterrupts` config

## Self-Check: PASSED

---
*Phase: 02-projects-authorization-layer*
*Completed: 2026-06-01*
