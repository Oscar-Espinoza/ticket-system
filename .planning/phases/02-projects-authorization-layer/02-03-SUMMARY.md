---
phase: "02"
plan: "03"
subsystem: project-list
tags: [server-component, drizzle, authorization, dashboard]
dependency_graph:
  requires: ["02-01 (requireProjectMember + schema)", "02-02 (createProject + CreateProjectDialog)"]
  provides: ["getProjectsForUser query", "ProjectList Server Component", "dashboard project list UI"]
  affects: ["src/app/dashboard/page.tsx", "src/components/project-list.tsx"]
tech_stack:
  added: []
  patterns:
    - "INNER JOIN project_member as authorization filter (T-02-07)"
    - "cast(count(case when ...) as int) for numeric ticket counts (T-02-09)"
    - "Server Component resolves session via auth.api.getSession({ headers: await headers() }) (T-02-08)"
    - "Card-as-Link pattern for clickable project cards"
key_files:
  created:
    - src/components/project-list.tsx
  modified:
    - src/app/dashboard/page.tsx
decisions:
  - "ProjectList renders its own section header + CreateProjectDialog — dashboard page.tsx stays additive-only (no duplicate dialog)"
  - "getProjectsForUser uses INNER JOIN on project_member as the sole authorization filter; no OR clause needed since owner rows are seeded as project_member rows in createProject"
  - "mt-8 top margin on ProjectList's root div (instead of on dashboard's seam) for correct spacing per UI-SPEC"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-06-02"
  tasks_completed: 2
  files_modified: 2
---

# Phase 02 Plan 03: Project List Server Component Summary

**One-liner:** INNER JOIN owned-or-member project query with cast-to-int ticket counts, rendered as clickable shadcn Cards inside the dashboard children seam.

---

## What Was Built

### Task 1 — getProjectsForUser + ProjectList (commit 984a224)

Created `src/components/project-list.tsx` exporting:

- **`getProjectsForUser(userId)`** — Drizzle query using `.from(projectMembers).innerJoin(projects).leftJoin(tickets).where(eq(projectMembers.userId, userId))` with GROUP BY and `cast(count(case when ...) as int)` for numeric open/resolved counts. The INNER JOIN is the authorization filter (T-02-07); `cast` prevents bigint-as-string bug (T-02-09).

- **`ProjectList`** — `async` Server Component that resolves session server-side (T-02-08), calls `getProjectsForUser`, and renders either:
  - A section header (`flex items-center justify-between`) with `h3 "Projects"` and `<CreateProjectDialog />` CTA
  - A `flex flex-col gap-3` stack of `<Link>`-wrapped `Card` components (name, ticket-key Badge `font-mono secondary`, role Badge `secondary/outline`, open/resolved counts `text-muted-foreground`)
  - OR an empty state (`flex flex-col items-center justify-center py-12 gap-4`) with heading, body, and a second CTA button

### Task 2 — Dashboard wiring (commit a2bc2e4)

Additive edit to `src/app/dashboard/page.tsx`:
- Added import: `import { ProjectList } from '@/components/project-list'`
- Added render: `<ProjectList />` inside the existing Phase 2 seam comment
- All existing greeting, GitHub badge, header, and logout code unchanged
- No duplicate CreateProjectDialog (owned by ProjectList)

---

## Test Results

```
Tests: 18 passed (18)
```

PROJ-02 tests (2) GREEN: owner+member listing verified; 0/0 numeric counts for ticketless project verified.
All prior tests (MEM-06 x3, PROJ-01 x3, PROJ-03 x1, auth x9) remain GREEN.

---

## Deviations from Plan

None — plan executed exactly as written. The `mt-8` separation is placed on the ProjectList root `div` rather than on the seam in `page.tsx`; this is equivalent per the UI-SPEC and avoids touching the existing page shell structure.

---

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. The INNER JOIN authorization filter (T-02-07), server-side session resolution (T-02-08), and cast-to-int correctness fix (T-02-09) are all implemented per the plan's threat model.

No new threat flags.

---

## Known Stubs

- `openCount` and `resolvedCount` show `0 open · 0 resolved` for all projects until Phase 5 creates tickets — this is intentional per D-20 ("0/0 until Phase 5"). No tickets table rows exist yet; the LEFT JOIN correctly returns 0 counts.

---

## Self-Check: PASSED

- [x] `src/components/project-list.tsx` exists and exports `getProjectsForUser` + `ProjectList`
- [x] `src/app/dashboard/page.tsx` imports and renders `<ProjectList />`
- [x] Commit `984a224` exists (Task 1)
- [x] Commit `a2bc2e4` exists (Task 2)
- [x] `npx vitest run` shows 18/18 passing
- [x] `npx tsc --noEmit` passes (no output)
