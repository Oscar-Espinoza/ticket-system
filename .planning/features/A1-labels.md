# A1 — Labels

## Goal
Per-project colored labels, many per issue.

## UX
Label chips (colored dot) on rows/cards/detail. `LabelPicker`: multi-select
with checkmarks, type to filter, "Create label “…”" when no exact match
(random palette color). Stays open while toggling.

## Data / actions
`label` + `issue_label`. `IssueRow.labels` loaded in the same batch as rows.
`IssuePatch.labelIds` = full replacement set (validated: all ids belong to the
project). `actions/labels.ts`: `createLabel`, `updateLabel`, `deleteLabel`
(write level, name 1–40 chars, unique per project case-insensitively, hex
`#rrggbb`). Label management UI is B9's.

## Edge cases
Duplicate name → field error. Unknown label id → "Invalid label." Deleting a
label cascades its `issue_label` rows.
