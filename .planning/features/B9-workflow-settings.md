# B9 — Custom workflow statuses (settings UI)

## Goal
Admins shape the project's workflow: rename, recolor, describe, reorder,
add and delete states per type.

## UX — `/dashboard/projects/[id]/settings/workflow`
Sections in type order (Triage, Backlog, Unstarted, Started, Completed,
Canceled), each with a type glyph header, issue counts and `+` (add state).
Rows: state glyph (tinted), name, description, issue count, move up/down
buttons, `…` menu (Edit, Delete). Edit/add = inline row: color popover
(preset swatches + hex input), name, description, Save / Esc cancel.
Delete dialog: shows issue count and requires picking a replacement state
(StateIcon list of the other states); disabled when the state is the last of
its type (except triage). Non-admins see a read-only list.
Triage: at most one triage state (Linear); deleting it is blocked while
triage is enabled.

## Data / actions — `src/app/actions/workflow-states.ts` (admin level)
`createWorkflowState`, `updateWorkflowState`, `moveWorkflowState({id,
direction})` (rewrites positions 0..n within the type — positions only matter
within a type), `deleteWorkflowState({id, replacementId})`: one `db.batch`:
move every ticket of the state (incl. archived/trashed; FK is restrict) with
lifecycle timestamps recomputed in SQL for the type change, repoint
`project.github_pr_*_state_id`, delete the state, insert activity.
Every action emits project-level activity (`ticketId: null`,
`workflow_state.created|updated|reordered|deleted`, `data.summary`).
Names 1–40 chars, unique per project case-insensitively; colors `#rrggbb`;
description ≤ 200.

## Edge cases
Replacement from another project / same state → rejected. Race where the
last-of-type check passes twice → acceptable (both admins); count re-checked
server-side. Revalidates the project layout so pickers/board update.
