# B9 — Member profile pages

## Goal
`/dashboard/people/[userId]`: who someone is and what they're working on, for
people you work with.

## Access
Visible if viewer === user, or they share ≥ 1 project (one SQL query joining
project_member twice). Otherwise `notFound()` (no enumeration).

## UX
Header: large avatar, name, title, email, timezone + live local time
(client clock, updates each minute, "(+3h)" offset vs viewer). Bio below.
"Edit profile" link for yourself (→ /dashboard/settings/profile).
Sections: **Shared projects** (name, key, their role) · **Assigned issues**
(open = not completed/canceled, active, in shared projects; state icon, key,
title, project; links to `issuePath`) · **Recent activity** (their last 20
activity rows in shared projects: verb + issue key/title + relative time).
Empty states per section.

## Data
Server page: `getSession` → access query → `db.batch` of user+profile,
shared projects, activity; `queryIssues(and(assignee = user,
memberOfIssueProject(viewer), activeIssue(), state type open), {limit: 50})`.
Activity rendered from `data.summary` when present, else a verb for the core
`issue.*` / `comment.created` types.

## Files
`src/app/dashboard/people/[userId]/page.tsx` (+ `loading.tsx`),
`src/components/people/*` (local-time clock, activity line).

## Edge cases
No profile row → blanks. Invalid timezone string → hide local time. Deleted
issues/archived excluded from assigned; activity for purged issues shows the
stored key/title.
