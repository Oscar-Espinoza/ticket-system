# B11 — Slack integration

## Goal
Post selected issue events of a project to a Slack channel via an incoming webhook.

## UX
`Settings → Slack & webhooks` (admin edits; others see a read-only notice, never the URL).
Webhook URL input (must start with `https://hooks.slack.com/`), four switches — issue
created, issue completed, issue canceled, new comment — Save, "Send test message",
Disconnect. Toasts for results.

## Data / actions
- Storage: `project.slack_webhook_url`. There is no column for the event toggles, so they
  ride in the URL fragment: `https://hooks.slack.com/services/…#events=created,completed`.
  `fetch` never sends fragments; `parseSlackSetting()` / `formatSlackSetting()` in
  `src/lib/integrations/event-types.ts` are the only readers/writers (no fragment = all).
  Integration request: a real `slack_events jsonb` column later.
- `src/app/actions/integrations.ts`: `saveSlackSettings`, `sendSlackTest` (admin).
- `src/lib/integrations/slack.ts`: `postToSlack(events)` — one query for the projects'
  URLs (no-op when none), maps events → kinds (created / state→completed / state→canceled
  / comment.created), loads issue rows, actor names and comment bodies in one batch, sends
  ONE Block Kit message per project per dispatch (≤10 sections + "and N more"). Issue key +
  title link to the absolute permalink (`appUrl()` + `issuePath`), actor name, state.
  3 s timeout (`AbortSignal.timeout`), never throws.

## Files
`src/lib/integrations/{slack,event-types,event-context,app-url}.ts`,
`src/app/actions/integrations.ts`, `src/components/integrations/slack-settings.tsx`,
`src/app/dashboard/projects/[id]/settings/integrations/page.tsx`.

## Edge cases
Slack mrkdwn escaping (`& < >`). Actor null → "Automation". Purged issues skipped.
Bulk updates collapse into one message. Invalid/blank URL → field error; blank Save = disconnect.
