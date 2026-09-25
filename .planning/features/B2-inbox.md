# B2 — Inbox

## Goal
Linear-style two-pane inbox at `/dashboard/inbox` plus an unread badge next to
Inbox in the sidebar.

## UX
- Left list (≈360px): one row per issue (notifications grouped by ticketId;
  ticketless ones stand alone) showing the latest notification — actor avatar,
  issue key + title, type sentence ("Ana assigned you", "moved to Done"),
  relative time, unread dot. Header: All / Unread toggle, "…" menu with
  "Mark all as read" and "Archive all read".
- Right pane: the group's notifications (newest first, sentence + excerpt +
  time) and the issue summary — title, state, priority, assignee, description
  (Markdown from `src/components/editor` if B1 ships it, else plain text) and an
  "Open issue" link to the permalink page. Toolbar: read/unread, snooze, archive.
- Selecting a row shows it and marks the group read.
- Keyboard (hotkey registry, scope "Inbox"): j/k move, Enter open issue,
  u toggle read, e archive. Archive toasts with Undo.
- Snooze menu: 1 hour, tomorrow 9:00, next week (Mon 9:00), pick date (9:00).
  Snoozing marks unread so it resurfaces as new.
- Empty states: "Inbox zero" / "No unread notifications".

## Data / actions (`src/app/actions/notifications.ts`, all scoped to session user)
`markNotificationsRead({ids, read})`, `markAllNotificationsRead()`,
`archiveNotifications({ids, archived})`, `archiveReadNotifications()`,
`snoozeNotifications({ids, until})`, `getUnreadNotificationCount()`.
Page load (`src/lib/notifications/inbox.ts`): visible = `archivedAt IS NULL AND
(snoozedUntil IS NULL OR snoozedUntil <= now())`, newest by
`greatest(createdAt, snoozedUntil)`, capped at 300; actors joined; issue rows via
`queryIssues(inArray(id) AND memberOfIssueProject(user))` so issue details only
show while the viewer is still a member.
Local optimistic state; server props re-sync on `router.refresh()`.

## Badge
`InboxBadge` (server) streams the count in Suspense into a client pill that
refetches every 60s while the tab is visible, on focus/visibility, on navigation
(throttled) and on a `inbox:changed` window event the inbox fires after edits.

## Files
`src/app/dashboard/inbox/page.tsx`, `src/components/inbox/*`,
`src/lib/notifications/inbox.ts`, `src/components/app-shell/slots/inbox-badge.tsx`.

## Edge cases
Snoozed items due reappear on next load. Issue deleted/left project → notification
still listed with stored key/title, no summary and no link. ids from the client
are only ever used together with `userId = session user`.
