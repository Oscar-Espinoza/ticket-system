# D8 — Dashboards

## Goal
Custom dashboards of issue widgets, personal or shared with a project.

## UX
- `/dashboard/dashboards`: tabs "Dashboards" | "Pulse". List "Your dashboards" and
  "Shared with you" (name, scope project, owner, updated). "New dashboard" dialog: name,
  scope (a project or "All my projects"), description. `n`-free; palette command.
- `/dashboard/dashboards/[id]`: header (name, scope, shared toggle for the owner when
  project-scoped, rename, delete), responsive 4-column grid of widgets (1 col mobile,
  2 md, 4 xl). Owner edits: "Add widget" menu, per-widget menu (edit, size S/M/L/XL,
  move earlier/later, duplicate, remove). Others see read-only.
- Widget types: Number (count), Bar (group by state/priority/assignee/label/customer),
  Line (created vs completed per week, 4–52 weeks), Issue list (top N, order), Cycle
  progress (current cycle of a project), Epic progress (per epic, done/total), Time in
  status (open issues: median days in current state per state, from `stateChangedAt`).
- Widget editor dialog: title, project (dashboard scope or one project), query box
  (search syntax) + Filter menu/chips when a single project is chosen, type options.

## Data / actions
- `dashboard` table: widgets JSON `[{id,type,title,x,y,w,h,config}]`; `config` =
  `{projectId|null, filters: IssueFilters, groupBy, weeks, limit, orderBy, epicId}`.
  Normalised by `normalizeWidgets` (client-safe `components/dashboards/widget-model.ts`).
- `src/lib/dashboards.ts`: `getVisibleDashboards(userId)`, `getDashboard(id, userId)`
  (owner, or shared + member of its project), `getDashboardData` → scope projects'
  `ProjectData` + non-deleted issues (≤ 5000) + customer links. Widget values are
  computed on the client with `filterIssues` (same matcher as views) — instant edits.
- `src/app/actions/dashboards.ts`: create / update (name, description, shared, widgets) /
  delete / duplicate. Owner only; project scope requires membership (read), sharing needs
  write. Widgets ≤ 24, JSON ≤ 32 KB, widget projectIds must be in scope.
- Favorites: `dashboard` isn't a favorite target (not in FAVORITE_TARGETS) — skipped.

## Edge cases
Owner leaves the project → dashboard hidden until rejoined. Widget pointing at a project
the viewer can't see → "No access" placeholder. Empty dashboard → empty state with
"Add widget". Archived issues count only in the line chart (history).
