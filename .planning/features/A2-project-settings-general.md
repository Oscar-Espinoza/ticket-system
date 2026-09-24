# A2 — Project settings: General + Members (Linear "team settings")

## Goal
`/dashboard/projects/[id]/settings/*` with a left nav: General, Members,
Workflow (B9), Labels (B9), Templates (B10), Planning (B7), Automations (B7),
GitHub (B3), Integrations (B11), Intake form (B11), Import / export (B12).
`/settings` redirects to `/settings/general`.

## UX — General
- **Details**: name (≤ 100), description (≤ 2000), estimate scale select
  (None / Linear / Fibonacci / Exponential / T-shirt). Save → toast.
- **Issue key**: input (uppercase transform, `/^[A-Z]{2,6}$/`), warning that
  every issue ID changes (`OLD-12` → `NEW-12`) and existing branch names /
  links using the old key stop matching. Owner-only.
- **Danger zone**: delete project — owner only; AlertDialog, type the project
  name to enable the button; redirects to `/dashboard`.
- Members (non-admin) see the page read-only with a notice.

## Actions — `src/app/actions/project-settings.ts`
Each: session → membership role (owner/admin = admin) → validate → write.
- `updateProjectDetails(prev, formData)` — admin; name, description, estimateScale.
- `changeProjectKey(prev, formData)` — owner; regex; unchanged key = no-op;
  unique violation (23505) → field error.
- `deleteProject(projectId, confirmName)` — owner; confirmName must equal the
  current name server-side; `db.batch` deletes the project's tickets first
  (ticket.state_id is ON DELETE RESTRICT to workflow_state, so letting the
  cascade race could fail), then the project (cascades everything else).
- Revalidate `/dashboard` layout so sidebar/list/breadcrumb names refresh.

## Members
`settings/members/page.tsx` = the old members page (invite panel + roster);
`/dashboard/projects/[id]/members` now `redirect()`s there.

## Files
`src/app/dashboard/projects/[id]/settings/{layout,page}.tsx`,
`settings/general/page.tsx`, `settings/members/{page,loading}.tsx`,
`src/components/settings/project-general-form.tsx`,
`src/app/actions/project-settings.ts`, `…/[id]/members/page.tsx` (redirect).

## Edge cases
Non-member → A1's layout 404s; actions still re-check (returns Forbidden).
Concurrent key change collision → unique violation mapped to field error.
Deleting while others are viewing → their next request 404s.
