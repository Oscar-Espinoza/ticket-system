# A1 — Custom workflow states (+ canceled / duplicate)

## Goal
Replace the hard-coded 5-status enum with per-project `workflow_state` rows
(triage · backlog · unstarted · started · completed · canceled types).

## UX
- Status glyph by state *type*, tinted by the state's color: triage (orange
  double arrow), backlog (dotted ring), unstarted (ring), started (ring + pie),
  completed (filled check), canceled (filled ×). Canceled + Duplicate ship by
  default.
- List groups / board columns = the project's states in type order then
  position. Triage group only when triage is enabled or it has issues. List
  hides empty groups by default (display option); board shows every column.
- `StatePicker` (type to filter, 1–9 picks the nth state) everywhere status is
  shown; `s` on a focused row opens it.

## Data / actions
- `DEFAULT_WORKFLOW_STATES` (= migration 0003) seeded in `createProject`'s
  batch via `workflowStateInserts(projectId)`.
- New issues default to the first backlog state (else first unstarted).
- `startedAt` / `completedAt` / `canceledAt` maintained on state-*type*
  transitions (`stateTransitionTimestamps`), same rule optimistic + server.

## Files
`lib/workflow.ts`, `lib/workflow-server.ts`, `lib/issue-model.ts`,
`ui-icons/status-icon.tsx`, `issue-pickers/state-picker.tsx`, list/board/detail.

## Edge cases
State id from another project → rejected. Project with no backlog/unstarted
state → create errors "No default state". Deleting states is B9's problem
(FK is `restrict`).
