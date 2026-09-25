# D4a — Move issues between projects (teams)

## Goal
Linear's "Move to team": an issue (and its sub-issues) moves to another project,
gets a new key there, and old links keep working.

## UX
Issue `…` menu → **Move to project** submenu (loads targets on open): projects
where the viewer can write (owner/admin/member), current one excluded, with key
chip. Picking one moves immediately, toasts "Moved APP-12 → ENG-40" and
navigates to the new permalink. Hidden for guests / read-only viewers.

## Service — `moveIssue(actor, fromProjectId, id, toProjectId)` (issue-service)
No auth inside (callers authorize write in BOTH projects). Steps, one `db.batch`:
- Load the issue + all descendants (recursive, depth ≤ 50, ≤ `BULK_MAX`), the
  target project (key, counter, estimate scale, SLA policy, workspace), its
  states / labels / members, and the epics available to the target.
- **Sub-issues move along** (all descendants, archived/trashed included) so a
  parent never lives in another project. The root's own parent is cleared if it
  stays behind.
- Numbers: bump the target counter by N, issue i gets `counter - (N-1-i)` (same
  row-lock trick as create). Record `ticket_key_alias(oldKey → id)` per issue
  (upsert).
- State: same name (case-insensitive) → first state of the same type → target
  default. Timestamps via `stateTransitionTimestamps` when the type changes.
- Labels: kept by name (case-insensitive); unmatched are dropped and listed in
  the event (`droppedLabels`). No labels are created.
- Assignee kept only if a target member. Cycle cleared. Epic (+ milestone) kept
  only if `epicAvailableTo(target, actor)`; otherwise both cleared.
- Estimate cleared if invalid on the target scale. SLA deadline recomputed from
  the target policy (from `createdAt`), breach flag reset.
- Kept: comments, attachments, relations, subscribers, PR links (their
  `project_id` → target), activity (`project_id` → target, so the timeline
  follows), notifications (`project_id` → target). Customer requests stay with
  their project's customer.
- Events: `issue.moved` in the target (ticketId = issue, data: key, title,
  fromKey, toKey, fromProjectId, toProjectId, droppedLabels, summary
  "moved from APP-12"), and a project-level one in the source (ticketId null,
  summary "moved APP-12 to ENG-40"). Sub-issues get their own target event.

## Reads
`getIssueByKey(projectId, number, viewerId?)`: when no issue has that number and
`viewerId` is given, fall back to `ticket_key_alias` (`${project.ticketKey}-${n}`)
and return the issue only if `viewerId` is a member of its current project.
Callers compare `issue.projectId` to redirect.

## Files
`src/lib/issue-service.ts`, `src/lib/tickets.ts`, `src/app/actions/move.ts`
(`listMoveTargets`, `moveIssueToProject`), `src/components/issue-detail/slots/menu-move.tsx`.

## Edge cases
Same project → error. Deleted root can't move (restore first). Target without
states → error. Too many descendants (> BULK_MAX) → error.
