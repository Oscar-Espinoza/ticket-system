# D11 — Email digests (+ rendering of round-2 notification types)

## Goal
Users who find per-event emails noisy get one daily or weekly summary email
instead, while assignments and mentions still email right away.

## UX
- Settings → Notifications → Email: "Email digest" select — Off / Daily / Weekly
  (Mondays). Disabled while "Email me about notifications" is off. Help text:
  "Assignments and mentions still email you right away; everything else waits
  for the digest."
- Digest email: "Your daily digest — 7 updates on 3 issues"; one block per issue
  (key + title link, up to 5 sentences with actor and time, "+N more"), then a link
  to the inbox and to settings. Plain-text twin.

## Data / behaviour
- `user_profile.digestFrequency` ('off' | 'daily' | 'weekly'), `lastDigestAt`.
- dispatch.ts (digest-mode only change): when digest ≠ off, immediate emails only
  for `DIGEST_IMMEDIATE_TYPES` (assigned, mentioned).
- `cron/jobs/digests.ts` (daily): users with email on + digest on who are due —
  daily: ≥ 20 h since `lastDigestAt`; weekly: ≥ 7 d − 4 h, or Monday (UTC) and
  ≥ 20 h. Window = since `lastDigestAt` (≤ 14 days back; first digest looks back
  one period). Rows: unread, unarchived, not snoozed into the future, not already
  emailed, project null or still a member; newest 50.
- Claim first (`update … set lastDigestAt = now where lastDigestAt is not distinct
  from <old>`) so a retried/concurrent cron can't double-send; revert the claim if
  `sendEmail` fails (not configured → retried next day). Sent rows get `emailedAt`.
- Nothing new → claim stays (keeps cadence), no email. Sequential sends, ≤ 90 per
  run (Resend free tier is 100/day).

## New notification types (D5/D8/others)
- `describeNotification`: `sla_breached` ("SLA breached" / summary), `pulse`
  ("Your weekly pulse" / summary), `recurring_created` ("Created from a recurring
  schedule"), any other type with `data.summary` → "Actor summary" or the summary.
- Glyphs: TimerOff / Activity / Repeat. Inbox detail for issue-less rows (pulse)
  shows summary + optional `data.lines` list instead of "issue no longer available".
- Prefs toggles for SLA breaches and Pulse (honoured by push + digest; D5/D8 should
  check `prefEnabled` before inserting).

## Files
`src/lib/cron/jobs/digests.ts`, `src/lib/notifications/{types,email-templates,dispatch}.ts`,
`src/components/inbox/{notification-prefs-form,notification-glyph,inbox-detail}.tsx`.
