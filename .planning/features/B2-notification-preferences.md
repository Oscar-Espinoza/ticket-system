# B2 — Notification preferences

## Goal
`/dashboard/settings/notifications`: choose what notifies you and whether it
also emails you.

## UX
- Section "Email": switch "Email me about notifications" (+ address shown),
  "Send test email" button with a toast that says whether the message went out
  or was only logged (no `RESEND_API_KEY` / `EMAIL_FROM`).
- Section "Notify me when": one switch per type — assigned, mentioned,
  commented (on issues I subscribe to), status changed, completed, pull request
  merged. Reminders are always on (you set them yourself).
- Switches save immediately (optimistic, revert + toast on error).

## Data / actions
`user_profile.emailNotifications` and `user_profile.notificationPrefs` (keyed by
notification type; missing = on). `updateNotificationPrefs({email?, prefs?})`
upserts the row for the session user, only accepting known type keys;
`sendTestEmail()` sends to the session user's email.

## Files
`src/app/dashboard/settings/notifications/page.tsx`,
`src/components/inbox/notification-prefs-form.tsx`,
`src/app/actions/notifications.ts`, `src/lib/notifications/types.ts`.

## Edge cases
No profile row yet → defaults (all on). Test email is throttled client-side by
the pending state only (it goes to your own address).
