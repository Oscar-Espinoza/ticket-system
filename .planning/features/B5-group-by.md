# B5 — Group by

## Goal
Group list / board by state, assignee, priority, label, cycle, epic or nothing.

## UX
- Chosen in the Display menu. List: sticky group headers with count and "+" (creates
  with the group's patch); collapsible. Board: one column per group, every column a
  drop target.
- "No …" group for issues without a value (No assignee / No priority / No label /
  No cycle / No epic), always last.

## Data
- `groupIssues(issues, groupBy, data)` in `src/lib/issue-grouping.ts` returns every
  group (empties included). Patches: state → `{stateId}`, assignee → `{assigneeId}`,
  priority → `{priority}`, label → `{labelIds:[id]}` (create), cycle → `{cycleId}`,
  epic → `{epicId}`, none → `null`.
- Label grouping lists multi-label issues in each label group.
- `patchForMove(issue, target, source?)` turns a drop into a real patch: for labels
  it removes the source group's label and adds the target's (No label clears all);
  every other kind is just the target's patch.
- Members removed from the project still get a group from the issue's assignee.

## Files
`src/lib/issue-grouping.ts`, `src/components/issues/issue-list.tsx`, `src/components/board/board.tsx`.

## Edge cases
- Grouping data is `Pick<ProjectData,…>`; missing optional lists degrade to "No …" groups.
- Triage state column hidden when triage is off and it is empty (kept from Wave A).
- Completed cycles only appear when they hold issues.
