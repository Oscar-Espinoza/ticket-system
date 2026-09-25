# B6 — Archive page

## Goal
`/dashboard/projects/[id]/archive`: find archived issues and bring them back.

## UX
- Header "Archive" + count, search box (client-side, key/title).
- Rows: state icon, key, title (link to permalink page), labels, "archived
  3d ago", Unarchive button (write access). Unarchive removes the row
  optimistically with a toast.
- Empty state: "No archived issues" (explains auto-archive & manual archive).

## Data
Server: `queryIssues(and(project = id, archived_at is not null, deleted_at is
null, memberOfIssueProject(user)), { orderBy: archived_at desc })`.
Client: `useIssueMutations(issues, { include: i => !!i.archivedAt && !i.deletedAt })`,
Unarchive = `mutations.restore`.

## Files
`src/app/dashboard/projects/[id]/archive/page.tsx`,
`src/components/navigation/issue-bin.tsx` (shared with Trash).

## Edge cases
Guests: read-only (no buttons). Search with no hits → "No matching issues".
