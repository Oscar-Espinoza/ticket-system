# D10a — Webhook retries & delivery log

## Goal
Outgoing webhooks survive receiver outages: every delivery is logged and failed
ones retried with exponential backoff; admins can inspect and redeliver.

## Behaviour
- Every attempt goes through `webhook_delivery` (payload, eventType, attempt, status,
  error, nextAttemptAt, deliveredAt). New events: one insert per batch, then sends.
- Success = HTTP 2xx. Failure schedules the next attempt after 1 min, 5 min, 30 min,
  2 h, 12 h (by attempt count); after the 6th attempt (initial + 5 retries) it gives up
  (`nextAttemptAt = null`, status/error kept).
- A network failure/timeout stops that webhook's batch (no 5 s stall per event); the
  skipped deliveries are scheduled for +1 min without consuming an attempt.
- Retries are lazy (no queue on the free tier): (1) after each new delivery run for
  the same webhooks, (2) when the integrations settings page loads (`after()`),
  (3) the daily cron job `webhook-retries` (also prunes rows older than 30 days).
  Due rows are *claimed* with a conditional UPDATE … RETURNING (lease 5 min) so
  concurrent runners never double-send.
- SSRF guard (`isDeliverableUrl`) runs on every attempt; disabled webhooks aren't retried.
- Headers add `X-Webhook-Attempt`; `X-Webhook-Delivery` stays the event id (stable
  across retries → receivers dedupe on it).

## UX (Settings → Slack & webhooks)
Row menu "Recent deliveries" → dialog with the last 20 deliveries: status dot,
event type, HTTP code / error, attempt n, time, "retry in 5 min" / "gave up",
expandable JSON payload, "Redeliver" (sends the stored payload now, new attempt).
Test deliveries are logged too (never retried).

## Files
`src/lib/integrations/outgoing-webhooks.ts`, `src/lib/cron/jobs/webhook-retries.ts`,
`src/app/actions/integrations.ts` (webhook parts), `src/components/integrations/webhook-settings.tsx`.
