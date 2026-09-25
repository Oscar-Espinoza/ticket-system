# D11 — Web push notifications

## Goal
Every inbox notification can also pop up as an OS notification on the user's
subscribed browsers/devices (standard Web Push, self-generated VAPID keys, $0).

## UX (Settings → Notifications → "Push")
- Not configured (any of `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT` unset): muted callout naming the vars and the
  `npx web-push generate-vapid-keys` command; nothing else renders.
- Account switch "Push notifications" (`user_profile.pushNotifications`) — pauses
  delivery to every device without forgetting them.
- This device: "Enable desktop notifications" button — the permission prompt only
  appears on that click. States: unsupported (iOS hint: add to Home Screen first),
  blocked (explain how to unblock), enabled ("Disable on this device").
- Device list: "Chrome on Linux · added 3d ago", "This device" tag, remove (trash)
  button. "Send test notification" button (toast with result).

## Data / actions
- `push_subscription` rows (endpoint unique, p256dh, auth, userAgent).
- `POST /api/push/subscriptions` `{ endpoint, keys: { p256dh, auth } }` — session
  auth, validated (https endpoint ≤ 1 KB, base64url keys); upsert on endpoint so a
  browser that switches accounts moves to the new user.
- `DELETE /api/push/subscriptions` `{ id } | { endpoint }` — only the caller's rows.
- Server actions (settings route `actions.ts`): `updateDeliverySettings({ push?,
  digest? })`, `sendTestPush()`.
- `src/lib/push.ts`: `pushConfigured()`, `sendPushes(targets)` — lazily sets VAPID
  details, sends with TTL 1 day, deletes 404/410 endpoints, never throws.
- `channels/push.ts` `deliverPush(rows)`: skips future-snoozed rows (reminders),
  users with push off or the type pref off; one push per row — title `KEY Title`,
  body = sentence (+ excerpt), url = issue permalink (or `data.url` / inbox),
  tag = ticket id so updates on one issue collapse. >5 rows for one user in a batch
  → 4 pushes + one "N more notifications" linking to the inbox.

## Service worker (`public/sw.js`, shared with B12 offline caching)
- `push`: `showNotification(title, { body, tag, renotify, icon, data.url })`.
- `notificationclick`: focus a tab already on the URL, else navigate+focus an open
  app tab, else `openWindow(url)`; only same-origin URLs.
- Dev: B12 registers the SW in production only; enabling push in dev registers
  `/sw.js?mode=push`, which skips precache + fetch handling (no stale dev bundles).

## Edge cases
- Keys rotated → existing subscription has a different key: unsubscribe + retry.
- Permission denied / revoked: button disabled with guidance; stale server rows
  are pruned on the next 404/410.
- Sign-out doesn't unsubscribe (Linear behaviour); the device list shows it.

## Files
`src/lib/push.ts`, `src/lib/notifications/channels/push.ts`, `src/app/api/push/subscriptions/route.ts`,
`public/sw.js`, `src/components/pwa/push-settings.tsx`, `src/app/dashboard/settings/notifications/{page,actions}.tsx|ts`.
