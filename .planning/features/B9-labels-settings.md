# B9 — Labels (settings management UI)

## Goal
One place to manage a project's labels.

## UX — `/dashboard/projects/[id]/settings/labels`
Search box + "New label" button. List rows: color dot, name, description,
issue count ("3 issues"), `…` menu (Edit, Delete). New/edit = inline row with
color popover (presets + hex), name, description; Enter saves, Esc cancels.
Delete → AlertDialog "Delete label X? It will be removed from N issues."
Members+ can manage (labels.ts is write-level); guests read-only. Empty state
when no labels; "No labels match" for empty search.

## Data
Page: `getProjectData` (labels with description, role) + one grouped count
query (`issue_label` ⨝ active tickets). Mutations via
`src/app/actions/labels.ts` (`createLabel`, `updateLabel`, `deleteLabel`) —
field errors shown inline. The action revalidates the project layout, so the
list refreshes from the server.

## Files
`src/app/dashboard/projects/[id]/settings/labels/page.tsx`,
`src/components/settings/labels/labels-settings.tsx`, shared
`src/components/settings/workflow/color-picker.tsx`.

## Edge cases
Duplicate name (case-insensitive) → inline error. Label deleted by someone
else → "Label not found." toast + refresh.
