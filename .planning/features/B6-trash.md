# B6 — Trash page

## Goal
`/dashboard/projects/[id]/trash`: restore deleted issues or delete them for
good.

## UX
- Header "Trash" + note "Issues in the trash are permanently deleted after 30
  days." Search box like Archive.
- Rows: state icon, key, title (link to permalink page, which shows the trash
  banner), "deleted 2d ago", Restore (write), "Delete permanently" (admins;
  AlertDialog confirm). Both remove the row optimistically.
- Empty state: "Trash is empty".

## Data
Server: `queryIssues(and(project = id, deleted_at is not null,
memberOfIssueProject(user)), { orderBy: deleted_at desc })`.
Client: `useIssueMutations(issues, { include: i => !!i.deletedAt })`; Restore =
`mutations.restore`; purge = `purgeIssue` action (admin check server-side)
with a local optimistic "purged" set rolled back on failure. Purge after 30
days is B7's automation.

## Files
`src/app/dashboard/projects/[id]/trash/page.tsx`,
`src/components/navigation/issue-bin.tsx`.

## Edge cases
Non-admin never sees "Delete permanently"; server rejects anyway.
