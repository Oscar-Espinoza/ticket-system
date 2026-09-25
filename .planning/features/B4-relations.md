# B4 — Issue relations

**Goal:** blocks / blocked by / related / duplicate relations between issues of a project.

## Storage
One `issue_relation` row per relation: `blocks` (ticket blocks related), `related`,
`duplicate` (ticket duplicates related). "Blocked by" / "Duplicated by" are inverse views.
UI types: `blocks | blocked_by | related | duplicate_of` (+ read-only `duplicated_by`).
`blocked_by` is stored as `{ticket: other, related: self, type: blocks}`.

## UX
- Section "Relations", groups in order Blocked by · Blocks · Related · Duplicate of ·
  Duplicated by, each row = compact issue row (state icon, key, title) + hover "×" remove.
- "+" button → popover step 1: relation type (Blocks, Blocked by, Related to, Duplicate of),
  step 2: `IssueSearchPicker` (excludes self and issues already related that way).
- "Duplicate of" = "Mark as duplicate of…": creates the relation AND moves this issue to the
  project's "Duplicate" canceled state (else the first canceled state).
- Guests: read-only. Empty + read-only → nothing rendered.

## Data / actions (`src/app/actions/relations.ts`, helpers in `src/lib/relations.ts`)
- `getIssueRelations({projectId, ticketId})` (read) → `IssueRelationView[]` with the other
  issue as an `IssueRow` (deleted ones hidden). Loaded on open and after each mutation;
  related rows prefer the fresher optimistic copy from `mutations.issues`.
- `addIssueRelation({projectId, ticketId, relatedTicketId, type})` (write): both issues in the
  project and not deleted, not self, no existing relation of that kind in either direction
  (blocks ↔ blocked-by conflicts too). Batch: insert + bump both `updated_at` + activity.
- `removeIssueRelation({projectId, relationId})` (write): relation's ticket must be in project.
- Events `relation.created` / `relation.removed` on BOTH issues, `data: {key, title, summary,
  relation, relatedIssue: {id,key,title}}` — summary e.g. "marked as blocking APP-3".
- Duplicate state move through `issue-service.updateIssueFields` (its own `issue.updated` event).
- Revalidate the project layout (so `updatedAt` changes → B1 timeline refetches).

## Edge cases
- Concurrent duplicate insert → `onConflictDoNothing` → "Already related".
- Related issue archived: still listed (dimmed); trashed: hidden.
