# D4b — Project labels (epic labels)

## Goal
Tag epics with project-scoped labels (separate from issue labels) and filter
the epics list by them.

## UX
- **Epics list header**: "Labels" filter button (multi-select popover with
  counts; `?label=a,b` — an epic matches if it has any selected label), and a
  "Manage labels" item in the same popover (write access) that opens a small
  dialog: list of labels with colour swatch, inline rename, colour picker,
  delete (confirm), plus a "New label" row.
- **Rows** show up to 3 label chips after the name (+N overflow).
  Row context menu gets a "Labels" submenu with checkbox items.
- **Epic detail sidebar**: "Labels" property row; the multi-select picker
  toggles labels (stays open) and offers "Create label "x"" when nothing
  matches exactly. Chips render under the row.

## Data / actions (`src/app/actions/epic-labels.ts`, write level)
- `createEpicLabel({projectId, name, color})` → `{ok, label}`; names 1–40 chars,
  case-insensitively unique per project (pre-check + 23505 backstop); `#rrggbb`.
- `updateEpicLabel({projectId, id, name?, color?})`, `deleteEpicLabel({projectId, id})`
  (links cascade).
- `setEpicLabels({projectId, epicId, labelIds})` — full replacement, every id
  must be a label of the project, epic scoped by project, ≤ 20 labels; one
  `db.batch` (delete + insert).
- Events (project-level, `ticketId: null`): `epic_label.created|updated|deleted`,
  `epic.labels_changed` — all with `data.summary` (e.g. "added label Infra to
  epic Search"), plus epic id/name.
- Reads: `getProjectEpics` returns `labels` (project's epic labels, by name)
  and each `EpicRow.labelIds`; `getEpicDetail` the same.

## Files
`src/app/actions/epic-labels.ts`, new `src/components/epics/epic-labels.tsx`,
`epics-list.tsx`, `epic-detail.tsx`, `epic-model.ts`, `src/lib/epics.ts`,
`src/app/dashboard/projects/[id]/epics/**`.

## Edge cases
- Filter by a deleted label id → ignored (unknown ids dropped).
- Guests: chips only, no picker / manage.
- Optimistic label toggles on detail/list; revert + toast on failure.
