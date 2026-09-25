# B6 — Issue permalink page

## Goal
`/dashboard/projects/[id]/issues/[key]` shows one issue full-page, so every
link (notifications, Slack, emails, search, My Issues, copy link) has a
stable, shareable target.

## UX
- Full-page `IssueDetail variant="page"` with working mutations (edit title,
  properties, sub-issue sections, comments via slots).
- Archived / trashed issues render IssueDetail's own banner + Restore; after
  archiving from the `…` menu the page stays and shows the banner (no redirect).
- `IssueShortcuts` slot rendered with `selectedIssue` = this issue.
- Metadata title `APP-12 Title`.

## Data
- Server page: `getSession` → `getProjectData(id, user)` (cached, membership-gated;
  the layout already 404s outsiders) → parse key `^([A-Za-z0-9]+)-(\d+)$`
  (case-insensitive) → `getIssueByKey(id, number)` + `getProjectIssues(id, user)`
  in parallel.
- A prefix that differs from the project key (lowercase, renamed key) redirects
  to the canonical `issuePath`, so old links survive a key rename.
- Client `IssuePermalink`: `useIssueMutations([...active, issue?], { include:
  i => i.id === issue.id || isActiveIssue(i) })` so the issue itself stays
  visible after archive/trash.

## Files
`src/app/dashboard/projects/[id]/issues/[key]/page.tsx`,
`src/components/navigation/issue-permalink.tsx`.

## Edge cases
- Malformed key, unknown number, purged issue → `notFound()`.
- Non-member → layout `notFound()`; metadata also returns a generic title.
- Pending/optimistic rows never reach this page (server data only).
