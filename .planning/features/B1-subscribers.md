# B1 — Subscribers / follow issue

## Goal
Let people follow an issue (receive its notifications) and see who follows it.

## UX
- Header bell button (`HeaderSubscribe`): filled bell = subscribed. Clicking
  opens a popover: "Subscribe" / "Unsubscribe" button and the subscriber list
  (avatars + names, "You" first). Tooltip-free: the aria-label says the state.
- Optimistic toggle; reverts with a toast on failure.
- Auto-subscription (no UI needed): commenters, mentioned users (B1), creator +
  new assignee (B2 dispatcher).

## Data / actions (`src/app/actions/subscriptions.ts`)
- `getIssueSubscribers({projectId, ticketId})` — `read` level; ticket must be in
  the project → `{ ok, subscribers: IssueUser[], subscribed }` (joined with users).
- `setSubscribed({projectId, ticketId, subscribed})` — `read` level (guests can
  follow too); uses `ensureSubscribed` / `unsubscribe` from
  `src/lib/subscriptions.ts`.
- Refetched when the issue id or `updatedAt` changes (assignment may have
  auto-subscribed someone).

## Edge cases
- Non-member / cross-project ticket ids → Forbidden / "Issue not found."
- Pending (temp) issues render nothing.
