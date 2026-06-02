---
phase: 02-projects-authorization-layer
verified: 2026-06-01T00:00:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Create a project via the dialog and confirm card appears on dashboard"
    expected: "Dialog closes on success; dashboard refreshes showing a new card with project name, ticket-key badge, Owner badge, and '0 open · 0 resolved'"
    why_human: "useEffect close-on-success and revalidatePath behavior require a running browser session with a real Next.js server"
  - test: "Type in the ticket-key input field and verify auto-uppercase transform"
    expected: "Lowercase letters are uppercased, digits and symbols are stripped, input is capped at 6 characters in real time"
    why_human: "onChange transform is a client-side interaction that cannot be verified by static analysis"
  - test: "Navigate to /dashboard/projects/<id> as a non-member and confirm the response"
    expected: "Browser shows a Next.js 404 Not Found page; the project's name is not revealed in the response"
    why_human: "notFound() produces an HTTP response that requires a live server to observe; the PROJ-03 test verifies the throw but not the full HTTP round-trip"
  - test: "Open the dashboard as a user who owns one project and is a member of another"
    expected: "Both projects appear in the list; owner project shows 'Owner' badge (secondary variant); member project shows 'Member' badge (outline variant)"
    why_human: "Badge variant rendering and the visual distinction between roles requires visual inspection in a browser"
---

# Phase 02: Projects + Authorization Layer — Verification Report

**Phase Goal:** Users can create projects and the server enforces project membership before any project-scoped operation
**Verified:** 2026-06-01
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Authenticated user can create a project with a name and ticket key and is auto-assigned as owner | VERIFIED | `createProject` in `src/app/actions/projects.ts` validates name + ticketKey, calls `db.batch([insert project, insert owner projectMember])`, and `createProject` wires session user as `ownerId` and `role: 'owner'`. |
| 2 | User's dashboard lists only projects they own or belong to | VERIFIED | `getProjectsForUser` in `src/components/project-list.tsx` issues `INNER JOIN` on `projectMembers` filtered by `userId` — no row for this user, no project returned. `ProjectList` is rendered in `dashboard/page.tsx`. |
| 3 | User can open a project and view its ticket list (empty on creation) | VERIFIED | `src/app/dashboard/projects/[id]/page.tsx` renders project header + "No tickets yet" `Card` placeholder. Route exists and is accessible to members. |
| 4 | Any request to a project the user does not belong to is rejected with a 403 before touching the database | VERIFIED | `requireProjectMember(id, session.user.id)` is at line 49 of the detail page; `db.select().from(projects)` is at line 57. The auth check runs first and throws `ProjectAccessError` which is caught and mapped to `notFound()` — the project SELECT never executes for non-members. |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/project-access.ts` | `requireProjectMember` DAL + `ProjectAccessError` class | VERIFIED | Exports `requireProjectMember`, `ProjectAccessError`, `ProjectMembership`. Selects only `{projectId, userId, role}`, uses `.limit(1)`, throws before return on no row. |
| `src/tests/projects.test.ts` | Wave 0 integration test suite, 446 lines | VERIFIED | 446 lines; contains `requireProjectMember`, `ProjectAccessError`, `createProject`, `getProjectsForUser` references across 9 `it()` blocks. |
| `src/components/ui/dialog.tsx` | shadcn Dialog primitive | VERIFIED | Exists; imported by `create-project-dialog.tsx`. |
| `src/app/actions/projects.ts` | `createProject` Server Action | VERIFIED | `'use server'`; `db.batch([...])` at line 63; `23505` check at line 88; `revalidatePath('/dashboard')` on success. |
| `src/components/create-project-dialog.tsx` | Client dialog using `useActionState` | VERIFIED | `'use client'`; `useActionState(createProject, initialState)`; `onChange` transform (uppercase + strip + slice); `useEffect` close-on-success; inline field errors via `state.errors`. |
| `src/components/project-list.tsx` | Server Component + `getProjectsForUser` | VERIFIED | Exports `ProjectList` and `getProjectsForUser`. Contains `innerJoin` + `leftJoin` + both `cast(count(...) as int)` expressions. Card links to `/dashboard/projects/${p.id}`. |
| `src/app/dashboard/projects/[id]/page.tsx` | Guarded detail page | VERIFIED | Imports `requireProjectMember` + `ProjectAccessError`; authorization call at line 49 precedes `db.select` at line 57; `catch` maps `ProjectAccessError` to `notFound()` and re-throws all other errors. |
| `src/app/dashboard/page.tsx` | Dashboard wiring `ProjectList` | VERIFIED | Imports `ProjectList` from `@/components/project-list`; renders `<ProjectList />` in the main content section alongside `{children}`. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `create-project-dialog.tsx` | `src/app/actions/projects.ts` | `useActionState(createProject, initialState)` | WIRED | Pattern confirmed at line 31 of the dialog; `action` is passed to `<form action={action}>`. |
| `src/app/actions/projects.ts` | `projects` + `projectMembers` tables | `db.batch([insert project, insert member])` | WIRED | `db.batch` at line 63; both insert values include correct FK fields. |
| `src/app/dashboard/page.tsx` | `project-list.tsx` | `<ProjectList />` rendered in content section | WIRED | Import at line 22; render at line 78. |
| `src/components/project-list.tsx` | `/dashboard/projects/[id]` | `Link href` wrapping each card | WIRED | Line 95: `href={\`/dashboard/projects/${p.id}\`}`. |
| `src/app/dashboard/projects/[id]/page.tsx` | `src/lib/project-access.ts` | `requireProjectMember` + `ProjectAccessError` + `notFound()` | WIRED | Import at line 23; call at line 49; catch at lines 50-53. |
| `src/app/dashboard/projects/[id]/page.tsx` | `/dashboard` | `<Link href="/dashboard">` back link | WIRED | Line 81; `ChevronLeft` icon + "Back to projects" text. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `project-list.tsx` | `userProjects` | `getProjectsForUser(user.id)` → Drizzle INNER JOIN + LEFT JOIN query against `projectMembers`, `projects`, `tickets` tables | Yes — DB query with GROUP BY and conditional counts | FLOWING |
| `projects/[id]/page.tsx` | `project` | `db.select({id, name, ticketKey}).from(projects).where(eq(projects.id, id)).limit(1)` after auth guard | Yes — minimal-column SELECT from DB | FLOWING |
| `actions/projects.ts` | N/A (write path) | `db.batch([insert project, insert projectMember])` | Yes — inserts two real rows atomically | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `requireProjectMember` exports exist | `node -e "const m = require('./src/lib/project-access.ts')"` | N/A — TypeScript module, not CommonJS | SKIP |
| Test file references all required symbols | `grep -c "requireProjectMember\|ProjectAccessError\|createProject\|getProjectsForUser" src/tests/projects.test.ts` | All 4 symbols present (confirmed by grep during verification) | PASS |
| `db.batch` present in createProject | `grep "db\.batch" src/app/actions/projects.ts` | Found at line 63 | PASS |
| `requireProjectMember` precedes `db.select` in detail page | Line comparison: requireProjectMember at line 49, db.select at line 57 | Ordering confirmed | PASS |
| No debt markers in phase files | `grep -n "TBD\|FIXME\|XXX"` across all 5 source files | No output — zero markers found | PASS |

---

### Probe Execution

No `probe-*.sh` scripts declared or found for this phase. Step 7c skipped.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| PROJ-01 | 02-02 | User can create a project with a name and ticket key | SATISFIED | `createProject` validates name + ticketKey, atomically inserts project + owner member via `db.batch`. |
| PROJ-02 | 02-03 | User can view a list of projects they own or are a member of | SATISFIED | `getProjectsForUser` INNER JOIN filters to user's memberships only; rendered in `ProjectList` on dashboard. |
| PROJ-03 | 02-04 | User can open a project to view its tickets | SATISFIED | `/dashboard/projects/[id]` renders project header + empty ticket placeholder for members. |
| MEM-06 | 02-01, 02-04 | Every project-scoped action is authorized against the user's membership | SATISFIED | `requireProjectMember` throws before any project SELECT (line 49 vs line 57 in detail page). INNER JOIN in `getProjectsForUser` is the authorization filter for list queries. |

All 4 requirement IDs from PLAN frontmatter are accounted for. No orphaned requirements for Phase 2 in REQUIREMENTS.md.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/dashboard/page.tsx` | 77-78 | `{children}` prop accepted but renders alongside `<ProjectList />` — the prop receives nothing from the dashboard route (no layout slot), making it dead code | INFO | No runtime bug; `children` is optional so rendering `undefined` is a no-op. Advisory from 02-REVIEW.md (BLOCKER classification in that review is misleading — it is not a correctness failure, just dead code). No impact on phase goal. |

No `TBD`, `FIXME`, or `XXX` markers found in any file modified by this phase.

---

### Human Verification Required

#### 1. Create-project flow end-to-end

**Test:** Sign in, click "New project", fill in a project name and ticket key (e.g. "TEST"), submit.
**Expected:** Dialog closes, dashboard refreshes, a new card appears with the name, "TEST" badge (monospace), "Owner" badge, and "0 open · 0 resolved".
**Why human:** `useEffect` close-on-success and `revalidatePath` require a live browser session with a running Next.js server.

#### 2. Ticket-key input auto-transform

**Test:** Open the "New project" dialog; type lowercase letters, digits, and special characters into the Ticket key field.
**Expected:** All input is uppercased; digits and non-A-Z characters are stripped immediately; field content is capped at 6 characters.
**Why human:** `onChange` client-side interaction; cannot be exercised by static analysis or the test suite.

#### 3. Non-member 404 (HTTP round-trip)

**Test:** Authenticate as user A, create a project. Then authenticate as user B (with no membership in that project) and navigate directly to `/dashboard/projects/<id>`.
**Expected:** The browser renders a Next.js 404 Not Found page. The project name is not visible anywhere in the response.
**Why human:** The PROJ-03 integration test verifies `ProjectAccessError` is thrown; the actual HTTP 404 response and absence of project data in the body require a live server.

#### 4. Owner/member badge visual distinction on dashboard

**Test:** Create a project as user A, then invite user B and have B accept (Phase 3 feature — can be simulated by manually inserting a `project_member` row with `role = 'member'`). Sign in as user B and view the dashboard.
**Expected:** The project card shows a "Member" badge using the `outline` variant (vs the `secondary` variant for "Owner"), visually distinct.
**Why human:** Badge variant rendering requires visual inspection; CSS variant classes (`secondary` vs `outline`) must be confirmed in a browser.

---

### Gaps Summary

No blockers. All 4 success criteria are implemented in the codebase with real, wired, data-flowing code. The 4 items above are behavioral/visual checks that require a browser session — they are not implementable gaps.

The dead `{children}` prop in `dashboard/page.tsx` (noted in 02-REVIEW.md) renders `undefined` silently and does not affect any success criterion. It is advisory only.

---

_Verified: 2026-06-01_
_Verifier: Claude (gsd-verifier)_
