# B2 — Notifications (in-app + email)

## Goal
Turn issue events into per-user `notification` rows (the inbox) and, when the
user allows it, a short email linking to the issue permalink.

## Trigger
`dispatchNotifications(events)` — called by `emitIssueEvent` after the response
(`after()`). Never throws: every failure is caught and logged.

## Rules (per event → recipients → type)
| Event | Recipients | Type |
|---|---|---|
| `issue.created` | assignee (if set and not the actor) | `assigned` |
| `issue.updated` change `assigneeId` | new assignee | `assigned` |
| `issue.updated` change `stateId` → completed | subscribers | `completed` |
| `issue.updated` change `stateId` (other) | subscribers | `status_changed` |
| `comment.created` | `data.mentions` → `mentioned`; subscribers → `commented` |
| `comment.updated` | `data.mentions` (newly added only, per B1) | `mentioned` |
| `description.mentioned` | `data.mentions` | `mentioned` |
| `github.pr_merged` | subscribers | `github` |

- Never notify the actor. One notification per (event, user); precedence
  assigned > mentioned > the subscriber type.
- Auto-subscribe: creator (actor) + assignee on `issue.created`, new assignee on
  assignment (`ensureSubscribed`), before the subscriber lookup.
- Recipients must still be members of the event's project (mentions are client
  input; subscribers may have left).
- Prefs: `user_profile.notificationPrefs[type] === false` drops the notification
  (default on); `emailNotifications` (default on) gates email. `reminder` is
  created by the reminder action, not here, and is never emailed.

## Data
`notification {userId, projectId, ticketId, actorId, type, data, createdAt}`;
`data` = `{ key, title, summary?, state?: {name,type}, excerpt?, commentId? }`
so the inbox renders without extra lookups. Comment excerpts come from B1's
`data.excerpt` (fallback: the `comment` row), mentions stripped, ~200 chars.

## Email
One email per user per dispatch batch (a bulk edit doesn't send 20 mails):
single → "KEY Title" subject with the sentence; several → digest. Text + simple
inline-styled HTML (`email-templates.ts`), links to
`${NEXT_PUBLIC_APP_URL}/dashboard/projects/<id>/issues/<KEY>`. `emailedAt` set
only for notifications `sendEmail` accepted.

## Files
`src/lib/notifications/dispatch.ts`, `types.ts` (client-safe type metadata +
sentence rendering), `email-templates.ts`.

## Edge cases
Purged issue (ticketId null) → skipped. Actor null (GitHub/automation) → shown
as "System"/"GitHub". Unknown event types → ignored. Batch inserts in one query.
