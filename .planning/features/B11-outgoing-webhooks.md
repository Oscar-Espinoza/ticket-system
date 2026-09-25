# B11 — Outgoing webhooks

## Goal
Let admins register HTTPS endpoints that receive signed JSON for issue events.

## UX
`Settings → Slack & webhooks`, section "Webhooks": list (URL, events summary, enabled
switch, last delivery status + relative time, menu: Edit, Reveal secret, Send test,
Delete). "Add webhook" dialog: URL, events checklist (none checked = all events),
enabled. After create the secret is shown once in the dialog (and can be revealed later).

## Data / actions
- `webhook` table (url, secret, events jsonb, enabled, lastStatus, lastDeliveredAt).
- Actions (admin, scoped by project id + webhook id): `createWebhook`, `updateWebhook`,
  `deleteWebhook`, `revealWebhookSecret`, `sendWebhookTest`. Max 10 per project.
- `deliverWebhooks(events)`: one query for enabled webhooks of the events' projects (no-op
  when none); issue rows loaded once. Payload
  `{ id, type, createdAt, projectId, issue: {id,key,title,state,priority,assignee,url}|null, data }`,
  headers `X-Webhook-Event`, `X-Webhook-Delivery`, `X-Webhook-Signature: sha256=<hmac hex of body>`.
  5 s timeout, `redirect: 'manual'`. Per webhook events are sent in order; a network
  failure stops that webhook's batch (no 250×5 s stalls). `lastStatus` (0 = network
  error) / `lastDeliveredAt` recorded once per webhook. Never throws.
- SSRF guard (`src/lib/integrations/url-guard.ts`): https only, no credentials, reject
  localhost / .local / .internal / private, loopback, link-local, CGNAT, ULA IPs — both
  literal hosts and DNS-resolved addresses at delivery time. Relaxed when
  `NODE_ENV !== 'production'` (http + private hosts allowed for local testing).

## Edge cases
Event type list is client-safe (`event-types.ts`); unknown future types still arrive via
"all events". Test deliveries use `type: 'webhook.test'`, `issue: null`.
