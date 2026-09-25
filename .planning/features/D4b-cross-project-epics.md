# D4b — Cross-team projects (cross-project epics, UI side)

## Goal
An epic owned by one project can collect issues from sibling projects in the
same workspace. The epic shows every such issue the viewer may see, progress
counts them, and the issue's "Epic" property can pick epics from other projects.

## UX
- **Epic detail → Issues tab**: when the epic has issues from more than one
  project, a small project switcher (`?project=<id>`, counts per project) sits
  above the list. The owning project renders the full `IssuesView` (editable,
  create defaults `{ epicId }`); other projects render a dense read-only list
  (state glyph, key, title, priority, assignee) linking to the issue permalink
  in its own project — those projects' states/labels/mutations don't exist in
  this page's project data, so they are edited where they live.
- Overview progress / list progress / roadmap bars / milestone progress include
  the other projects' issues.
- **PropertyEpic**: the picker lists this project's epics, then one group per
  other project ("Epics in <Project>") with the project key. Foreign epics load
  lazily (on picker open, or on mount when the issue already points at an epic
  that isn't local) and are cached per project for 60 s. A foreign epic shows
  its name + project key; "Open" links to its own project's epic page.
  Milestones of a foreign epic are pickable too.

## Data / actions
- `src/lib/epics.ts`: progress queries select tickets by `epicId ∈ project's
  epics` (not `ticket.projectId = project`) and are filtered per issue by
  `viewerIsMember(tickets.projectId)` — never leaks issues of projects the
  viewer isn't in. `getEpicDetail` drops the project filter on issues (keeps
  `memberOfIssueProject`) and returns `issueProjects` (id, name, key).
- `getCrossProjectEpicOptions(projectId, userId)`: D4a's
  `availableEpicsForProject` (issue-service — the same rule the service
  enforces on writes) filtered to `external` epics, mapped to
  `ForeignEpicOption` (+ milestones).
- Action `listAvailableEpics({ projectId })` (read level) in `actions/epics.ts`.
- Writes still go through `mutations.update(issue, { epicId, milestoneId })`
  → issue service (D4a validates cross-project ids).

## Files
`src/lib/epics.ts`, `src/app/actions/epics.ts`, `src/components/epics/epic-model.ts`,
`src/components/epics/epic-detail.tsx`, new `src/components/epics/epic-foreign-issues.tsx`,
`src/components/epics/epic-pickers.tsx`, `src/components/issue-detail/slots/property-epic.tsx`,
`src/app/dashboard/projects/[id]/epics/[epicId]/page.tsx`.

## Edge cases
- Project not in a workspace → no foreign epics (only local ones).
- Viewer loses membership of a sibling project → its issues vanish from the
  epic view and progress for that viewer only.
- Archived foreign epic → not listed; the issue shows "Epic in another project".
- Guests: read-only picker trigger.
