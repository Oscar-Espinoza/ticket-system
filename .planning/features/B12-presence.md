# B12 — Presence indicators

## Goal
Know who else is looking at the same issue.

## UX
`HeaderPresence` (issue detail header slot): overlapped 20px avatars (max 3, then
`+n`) of other members viewing this issue in the last 45 s; tooltip "Ana and Sam are
viewing". Nothing rendered when alone. No project-wide avatar stack: a fixed overlay
would collide with the detail pane's composer and toasts — kept to the issue header.

## Build
- `POST /api/projects/[id]/presence {ticketId|null, leave?}`: session + membership;
  upserts `presence(user, project)` with `ticket_id` resolved by subquery only if the
  ticket belongs to the project (else null); `leave` deletes the row. Responds with
  the same payload as GET. `GET` → `{users: [{id,name,image,ticketId}]}` = other
  members seen in the last 45 s (joined on project_member so removed members vanish).
- Client store (exported from `live-updates.tsx`): one channel per project, ref-counted;
  `useProjectPresence(projectId, ticketId?)`. Heartbeat every 15 s while visible,
  immediately when the viewed issue changes, `sendBeacon` leave on `pagehide` or when
  the last subscriber unmounts. `LiveUpdates` keeps the project channel alive;
  `HeaderPresence` works outside the project layout too (it acquires the channel itself).

## Edge cases
Self filtered server-side; hidden tab stops heartbeats so you drop off after 45 s;
several panes open → the most recently opened issue wins.
