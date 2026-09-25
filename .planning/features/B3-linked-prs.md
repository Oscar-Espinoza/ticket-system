# B3 — Linked pull requests on issue

## Goal
The issue detail shows the PRs GitHub linked to it.

## UX (`SectionPullRequests` slot)
Hidden until loaded and when the issue has no PRs (quiet, Linear-like). Header
"Pull requests" + count. Each row: state icon + badge (Open green, Draft gray,
Merged purple, Closed red), `#number`, title (truncate), `repo`, author login,
relative updated time — whole row links to the PR in a new tab.

## Data
`getLinkedPullRequests(projectId, ticketId)` read level → rows from
`github_pull_request` scoped by project + ticket, newest update first. Refetched
when the issue id or `updatedAt` changes (webhook state moves bump it).

## Edge cases
Action error → section stays hidden (logged). Draft + open shows "Draft".
