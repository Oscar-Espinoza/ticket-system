# B7 — Triage

## Goal
An inbox for new / incoming issues (intake form, API, non-members) that must be
accepted into the workflow, declined or marked duplicate.

## UX
- `/projects/[id]/triage`: list of active issues whose state type is `triage`,
  newest first (key, title, creator, labels, relative time), with the issue
  detail preview (`IssueDetailPane`) for the selected one. j/k (↑/↓) move,
  first issue auto-selected on desktop.
- Actions bar on the preview + row hover: **Accept** (`1`) opens a small dialog —
  state (backlog / unstarted / started states; default first backlog else
  unstarted), optional priority and assignee; Enter confirms. **Duplicate** (`2`)
  opens an issue search (project issues other than this one) → pick original.
  **Decline** (`3`) opens a dialog with an optional reason.
- After an action the next issue is selected. Toasts on errors.
- Triage disabled + nothing in triage → EmptyState "Triage is off" with an
  "Enable in settings" link (admins). Enabled + empty → "Triage is clear".
- Read-only roles see the list/preview without actions.

## Data / actions (`src/app/actions/triage.ts`, write level)
- `acceptTriageIssue({projectId,id,stateId,priority?,assigneeId?})` → issue
  service update (state must be non-triage, non-closed).
- `declineTriageIssue({projectId,id,reason?})` → first canceled state not named
  "Duplicate"; emits `triage.declined` with `data.summary` ("declined from
  triage" + reason).
- `markTriageDuplicate({projectId,id,originalId})` → verifies both issues are in
  the project, inserts an `issue_relation` (duplicate, onConflictDoNothing),
  moves to the "Duplicate" canceled state (else first canceled) and emits
  `triage.duplicate` with summary "marked as duplicate of KEY".
- Every action checks the issue is currently in a triage state (stale clicks
  return an error). `src/lib/triage.ts`: state resolution helpers.

## Edge cases
Original = self / deleted / other project → error. No canceled state → error
"No canceled state". Concurrent accept by two people → second gets "no longer in
triage".
