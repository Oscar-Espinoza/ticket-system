# B8 — Epics (Linear "projects" as groups of issues)

## Goal
Group a project's issues into epics with status, health, lead, dates, colour and
live progress; list them, open one, and assign issues to them from the issue detail.

## UX
- **List** `/projects/[id]/epics`: dense rows — colour glyph, name, status icon+label,
  health chip, lead avatar, target date, progress ring + "% · n/m" (tooltip: by
  count and by estimate points), issue count. Status filter (All / Active / Planned /
  Completed / Archived) as a toggle group; `j`/`k` move focus, `Enter` opens,
  "New epic" button + palette command. Empty and filtered-empty states.
- **Create dialog**: name, description, status, lead, start / target date, colour
  swatches. ⌘Enter submits.
- **Detail** `/projects/[id]/epics/[epicId]`: tabs Overview · Updates · Issues (`?tab=`).
  Overview = editable name + description (Markdown editor/renderer from B1 when
  present, else textarea + react-markdown), milestones, property sidebar (status,
  health, lead, start / target, initiative, progress). Issues = `IssuesView` with
  the epic's issues and `createDefaults={{ epicId }}`. Menu: archive / unarchive, favorite.
- **Issue slot** `PropertyEpic`: "Epic" picker (project epics) + "Milestone" picker
  (milestones of the chosen epic; hidden without an epic). Clearing the epic clears
  the milestone (issue-service already does this).

## Data / actions
- Reads `src/lib/epics.ts` (server): `getProjectEpics(projectId, userId, {archived})`,
  `getEpicDetail(projectId, epicId, userId)` — membership-gated in SQL (EXISTS on
  project_member), progress aggregated in SQL (issues not deleted, canceled excluded
  from scope; completed = state type completed; points = sum(estimate)).
- Actions `src/app/actions/epics.ts`: `createEpic`, `updateEpic` (name, description,
  status, health, leadId, startDate, targetDate, color), `archiveEpic`,
  `unarchiveEpic` — `authorizeProjectAction(projectId, 'write')`, epic id scoped by
  projectId, lead must be a project member, start ≤ target, `revalidatePath(project, 'layout')`
  so `useProjectData().epics` refreshes.
- Client-safe model: `src/components/epics/epic-model.ts` (statuses, health, progress helpers).

## Files
`src/lib/epics.ts`, `src/app/actions/epics.ts`, `src/components/epics/*`,
`src/app/dashboard/projects/[id]/epics/**`, `src/components/issue-detail/slots/property-epic.tsx`.

## Edge cases
- Unknown / other-project epic id → `notFound()` (enumeration-safe).
- Guests: read-only (pickers disabled, no create button).
- Archived epic: detail still reachable, banner + unarchive; hidden from pickers.
- Completion date status: setting status `completed`/`canceled` is manual (Linear parity).
