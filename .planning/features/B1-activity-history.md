# B1 — Activity history / audit log

## Goal
One chronological timeline per issue merging `activity` rows with comments.

## Data
- `getIssueTimeline({projectId, ticketId})` (`src/app/actions/comments.ts`,
  `read` level) → `{ activities, comments }` (types in `src/lib/timeline.ts`).
  One `db.batch`: activities (by ticket **and** project id), comments (joined to
  the ticket filtered by project), reactions (same join). Actor / author names
  come from joins, so former members still render.
- Called from `SectionActivity` when the issue opens and again (debounced
  ~400 ms) whenever `issue.updatedAt` changes — i.e. after local mutations and
  after revalidation / live refresh.

## UX
- Activity lines: small actor avatar, "**Name** changed status from Todo to
  In Progress · 2h ago" (absolute time in a tooltip). One line per change of an
  `issue.updated` event: state (with state glyphs), priority, assignee
  (assigned / unassigned / self-assigned), labels (added / removed), estimate,
  due date, parent, cycle, epic, milestone, title, description. Archive /
  unarchive / trash / restore / create have fixed sentences; any other type
  uses `data.summary`, falling back to "updated the issue". Null actor →
  `data.actorName` or "System".
- Comments render as cards in the same stream.
- Runs of more than 5 consecutive activity lines collapse to first + last 2 with
  a "Show N more" button between.
- Loading: skeleton rows; error: inline retry.

## Files
- `src/lib/timeline.ts` (client-safe types, reaction set, collapse helper)
- `src/lib/comments.ts` (server reads/writes)
- `src/components/comments/activity-line.tsx`, `timeline.tsx`
- `src/components/issue-detail/slots/section-activity.tsx`

## Edge cases
- Hidden types: `comment.*`, `description.mentioned`.
- Unknown fields in `changes` → "updated the issue".
- Cycles without a name → "Cycle N" from project data, else "a cycle".
