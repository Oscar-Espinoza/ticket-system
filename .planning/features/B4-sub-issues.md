# B4 — Sub-issues

**Goal:** list, create, attach, detach and open an issue's children from the detail view.

## UX
- Section "Sub-issues" with progress "done/total" + thin `Progress` bar (done = completed or
  canceled state type) when there are children.
- Rows: state icon, key (mono), title, assignee avatar; click / Enter opens the child
  (pane: `?issue=KEY`, page: permalink). Hover "×" = remove from parent.
- Footer actions (write only): "Add sub-issue" → inline input (Enter creates and keeps the
  input open for the next one, Esc/blur-empty closes); "Add existing" → `IssueSearchPicker`.
- Empty + read-only → nothing rendered. Empty + write → just the two quiet actions.

## Data / actions
- Children: `mutations.issues.filter(i => i.parentId === issue.id)` — optimistic, no fetch.
- Create: `mutations.create({ title, parentId, cycleId, epicId, milestoneId })` — inherits the
  parent's cycle and epic/milestone (optimistic placeholder shows up immediately).
- Attach existing: `mutations.update(child, { parentId: issue.id })`; candidates exclude self,
  current children, ancestors (cycle) — server re-validates, errors toast.
- Detach: `mutations.update(child, { parentId: null })`.

## Files
- `src/components/issue-detail/slots/section-sub-issues.tsx`
- `src/components/issue-hierarchy/issue-ref-row.tsx` (shared compact issue row)
- reuses `issue-search-picker.tsx`, `open-issue.ts`, `tree.ts`

## Edge cases
- Archived / trashed children aren't in the active list and aren't shown (Linear hides them too).
- Pending (temp-id) children render but aren't openable/removable until confirmed.
- Title max 200 chars (service limit).
