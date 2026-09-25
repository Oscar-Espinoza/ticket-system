# D7 — Per-user Slack notifications

## Goal
Users who link their Slack account get their inbox notifications as Slack DMs from
the app bot.

## UX
Settings → Slack → "Your Slack account": "Link my Slack account" (Sign in with
Slack / OpenID Connect — proves the Slack identity; linking by email is avoided
because app emails aren't verified). Linked workspaces list with a "Send me DM
notifications" switch and Unlink. The installer is linked automatically.

## Data / actions
- `GET /api/slack/link` → `https://slack.com/openid/connect/authorize` (scope
  `openid`, signed state + nonce cookie) → shared callback → `openid.connect.token`;
  the `id_token` (received over TLS from Slack's token endpoint) carries
  `https://slack.com/user_id` / `team_id`; `aud` and `nonce` are checked. Team must
  have an installation. Upsert `slack_user_link`, evicting any other app user linked to
  the same Slack user (the unique `(team_id, slack_user_id)`).
- Actions: `setSlackDmNotify({teamId, notify})`, `unlinkSlack({teamId})`.
- `deliverSlackDm(rows)`: one query for recipients' links (`notify = true`) + their
  installs, one for actor names; one DM per (user, workspace) per batch — up to 10
  lines `*<url|KEY-12>* Title — Ana assigned you` + "and N more";
  `conversations.open` → `chat.postMessage`. Sequential per workspace; a 429 skips
  the rest of that workspace's batch. Never throws.

## Files
`src/lib/notifications/channels/slack-dm.ts`, `src/lib/slack/{api,installations,
state}.ts`, `src/app/api/slack/link/route.ts`, `src/components/slack/*`.

## Edge cases
Env unset → channel is a no-op. Bot token undecryptable (rotated secret) → skip
that workspace. Uninstall deletes links. Notification without key → link to inbox.
mrkdwn escaping of titles and names.
