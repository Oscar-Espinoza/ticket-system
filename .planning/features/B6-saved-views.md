# B6 — Custom saved views

## Goal
Save the current filters + display options of a project's issue list as a
named view, personal or shared with the project.

## UX
- `ToolbarExtra` (issues toolbar): "Save view" → dialog (name, description,
  "Share with project members" switch). On a saved view page: "Update view"
  (owner, writes current filters/display; highlighted when they differ) and
  "Save as new".
- `/dashboard/views`: your views + views shared in your projects, grouped
  "Your views" / "Shared with you", each with project, description, updated
  time, star (favorite), and owner actions Rename (dialog) / Delete (confirm).
- `/dashboard/projects/[id]/views`: the same list for one project.
- `/dashboard/projects/[id]/views/[viewId]`: header (name, description,
  shared badge, star) + `IssuesView` with `initialFilters`, `initialDisplay`,
  `savedView`. `/dashboard/views/[viewId]` redirects there.

## Data / actions
- `src/lib/views.ts`: `getVisibleViews(userId, projectId?)`,
  `getViewForUser(viewId, userId)` — visible if (owner or shared) AND member of
  the view's project (SQL join on project_member).
- `src/app/actions/views.ts`: `createView`, `updateView`, `deleteView`.
  Create: `authorizeProjectAction(projectId, 'read')`; sharing needs 'write'.
  Update/delete: owner only, and still a project member. filters/display must be
  plain JSON objects < 16 KB. Delete also removes favorites pointing at it.
- Saved view context (`SavedViewProvider`) set by the view page so the toolbar
  knows which view is open (also accepts a `savedView` prop from IssuesView).

## Files
`src/app/actions/views.ts`, `src/lib/views.ts`,
`src/components/navigation/{save-view-dialog,saved-view-context,saved-view-issues,view-list}.tsx`,
`src/components/issues/slots/toolbar-extra.tsx`, the three view pages.

## Edge cases
- Stale saved JSON missing new display fields → merged over defaults on load.
- Save view only offered on the project issues page and view pages (cycle/epic
  lists have implicit scope that a view wouldn't capture).
- Non-owner on a shared view sees "Save as new" only.
