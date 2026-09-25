# B6 — My Issues

## Goal
`/dashboard/my-issues`: everything that concerns me across every project I'm a
member of.

## UX
- Tabs (links, `?tab=`): Assigned (default) · Created · Subscribed · Activity.
- Assigned/Created/Subscribed: grouped by state type — Started → Unstarted →
  Backlog → Triage → Completed → Canceled; completed/canceled groups collapsed
  by default. Quick filter "Hide completed" switch (drops those groups).
- Activity: flat list of issues I most recently acted on (my `activity` rows),
  newest first, with the time of my last action.
- Rows: priority, key, state, title, labels, project key chip, assignee avatar,
  updated time; each row links to the permalink page. j/k move focus between
  rows, Enter follows the link.
- Empty state per tab.

## Data
`src/app/dashboard/my-issues/queries.ts`: `getMyIssues(userId, tab)` → `queryIssues(and(filter,
activeIssue(), memberOfIssueProject(userId)), { limit: 500 })`.
- assigned: `assigneeId = me`; created: `creatorId = me`;
- subscribed: `exists(issue_subscriber where ticket = t.id and user = me)`;
- activity: `ticket.id in (select ticket_id from activity where actor = me)`,
  ordered by correlated `max(activity.created_at)` desc, limit 50.

## Files
`src/app/dashboard/my-issues/page.tsx`, `src/app/dashboard/my-issues/queries.ts`,
`src/components/navigation/{nav-issue-row,issue-groups,page-tabs}.tsx`.

## Edge cases
- Archived / deleted excluded; projects I left disappear (membership EXISTS).
- Unknown `tab` → Assigned.
