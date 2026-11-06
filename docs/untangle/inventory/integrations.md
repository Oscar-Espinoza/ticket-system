# Inventory: integrations, events, notifications, jobs

Scope: src/lib/{github,vcs,slack,integrations,notifications,cron,sentry,import}, events.ts, push.ts, github-token.ts, subscriptions.ts,
the listed server actions, webhook/cron/slack routes. Read-only. The events <-> notifications <-> integrations "cycle" is type-only
(`import type` from events.ts at dispatch.ts:17, integrations/slack.ts:11, outgoing-webhooks.ts:33, event-context.ts:9): no runtime cycle,
but events.ts hard-wires all three (events.ts:83 DISPATCHERS) and all three depend on its types.

## Structural findings (max 25, most important first)

**A. Code hosts modelled twice; the neutral engine sits under one provider's name**
- [hidden] src/lib/vcs/automation.ts:28-29 — the single copy of "ticket key in branch/title/body -> link PR + move state" is good, but its pure halves
  (`classifyPullRequest`, `shouldAdvance`, `resolveAutomationState`, `AUTOMATION_OFF`) live in src/lib/github/{references,automation}.ts, so vcs/ imports github/.
  Fix idea: move both files into vcs/.
- [special:module-identity] src/lib/vcs/automation.ts:39-45 — GitLab/Bitbucket PR events are still named `github.*`; consumers match the literal:
  notifications/dispatch.ts:39,204 (`'github.pr_merged'`, not `PR_EVENT.prMerged`), notifications/types.ts:83 (`type === 'github' ? 'GitHub' : 'Automation'`),
  audit.ts:77, notification type `'github'`. Fix idea: new `vcs.*` names, read both, write new.
- [surplus] src/lib/github/sync.ts:21 — `GITHUB_EVENT = PR_EVENT` alias; only user actions/github.ts:25,192.
- [hidden] project PR-automation settings are `projects.githubPrOpenStateId/MergeStateId` for every provider, and the `{id, ticketKey, prOpenStateId, prMergeStateId}`
  shape is rebuilt in github/sync.ts:115, vcs/integrations.ts:75-81 and the GitHub route's `projectColumns` (webhooks/github/+server.ts:22-29).
  Fix idea: one `loadVcsProject`.
- [special:module-identity] server/actions/developer.ts:155,205-235,328 — `deleteHook`/`registerHook` switch on `provider === 'gitlab'` with `as GitlabConfig`/`as BitbucketConfig` casts
  outside the provider modules; the "can't reach <url> ... set PUBLIC_APP_URL" warning is copied in actions/github.ts:279 and developer.ts:227. A 4th host edits both.
  Fix idea: `VcsHost` adapter `{createHook, deleteHook}` per provider (GitHub included) behind one registry.
- [hidden] github/webhooks.ts:29-35 vs vcs/integrations.ts:98-101 — two "webhook base URL" rules: GitHub uses `GITHUB_WEBHOOK_BASE_URL ?? PUBLIC_APP_URL ?? localhost`,
  GitLab/Bitbucket/Sentry use `?? appUrl()` (adds BETTER_AUTH_URL, Vercel URL). With only BETTER_AUTH_URL set, GitHub hooks say "unreachable" and GitLab hooks work.
  Fix idea: GitHub calls the same function.
- [needless] routes/api/webhooks/bitbucket/[integrationId]/+server.ts:10 imports `verifySignature` from `github/webhooks`; sentry/webhook.ts:22 imports `hmacHex`/`safeEqual`
  from `vcs/secrets`. No module owns the HMAC primitive.

**B. Copied security primitives and constants**
- [hidden] vcs/secrets.ts:10-24 and slack/installations.ts:23-35 — identical `encryptToken`/`decryptToken`; github-token.ts:44-55 is a third decrypt with its own `isEncrypted` guess.
- [hidden] timing-safe compare written 6 times: github/webhooks.ts:134, slack/signature.ts:25, slack/state.ts:34, vcs/secrets.ts:36, integrations/intake.ts:33, routes/api/cron/daily/+server.ts:19.
  Fix idea (both): one `lib/server/crypto.ts` (secret-box, safeEqual, hmacHex, verifyHmacHeader).
- [special:copied-constant] integrations/intake.ts:12 `'intake-dev-secret'`, slack/state.ts:20 `'slack-dev-secret'`: a missing BETTER_AUTH_SECRET in production signs with a public string.
  Fix idea: one `appSecret()` that throws in production.
- [hidden] slack/api.ts:51 hardcodes `'https://hooks.slack.com/'` (= `SLACK_URL_PREFIX`, event-types.ts:42); slack/oauth.ts:44 hardcodes `'openid'` beside `USER_SCOPES` (config.ts:11, never imported);
  `'/dashboard/settings/slack'` in oauth.ts:13, settings-slack.ts:20 and asks.ts `settingsUrl`.

**C. Two Slacks, misplaced helper, ad hoc HTTP**
- [needless] `slackEscape` lives in integrations/slack.ts (the incoming-webhook dispatcher) but slack/asks.ts:15, channels/slack-dm.ts:12 and actions/integrations.ts import it. The Slack app
  (src/lib/slack/*, bot token, DMs) and the per-project incoming webhook share only that helper and a name. Fix idea: slack/format.ts; rename integrations/slack.ts to slack-webhook.ts.
- [hidden] HTTP stacks: slack/api.ts:23,51 and integrations/slack.ts:38 each hand-roll `fetch` + `redirect:'manual'` + `AbortSignal.timeout(3000)`; vcs/http.ts (guardedRequest, 10 s); Octokit (10 s,
  github/client.ts:10). Timeouts are unnamed literals: Slack 3 s, webhooks/Sentry 5 s, GitHub/VCS 10 s, Asana/push 15 s, Shortcut 20 s. Retries exist only for outgoing webhooks.

**D. Notification production has no single entry**
- [hidden] five producers insert `notifications` by hand: dispatch.ts:261, cron/jobs/sla.ts:126, cron/jobs/pulse.ts:116, recurring.ts:160, actions/notifications.ts:241 (reminder). Each must
  remember `prefEnabled`, the membership check and `deliverToChannels(rows)`; only dispatch.ts emails, so sla/pulse/recurring never email, silently. Fix idea: `createNotifications(rows)`.
- [hidden] channels/push.ts:28 and slack-dm.ts:34 each re-filter `snoozedUntil`; "no profile row = defaults = on" is re-implemented in push.ts:79 and dispatch.ts emailRecipients; actor names
  are looked up three times (dispatch.ts:231, push.ts:53, slack-dm.ts:58). Fix idea: resolve recipients once in `deliverToChannels`.
- [hidden] cadence copied: digests.ts:27 `7*DAY - 4*HOUR` vs pulse.ts:58 `7 * DAY_MS - 4 * 3_600_000`, and the "Monday UTC" rule (digests.ts:49, pulse.ts:32).
- [hidden] settings-notifications.ts:32 and actions/notifications.ts:136-171 both upsert `userProfiles` (delivery vs per-type prefs); the configurable set is spread over NOTIFICATION_PREFS,
  DIGEST_IMMEDIATE_TYPES (types.ts) and these two actions.
- [hidden] issue key `${ticketKey}-${number}` rebuilt at cron/jobs/sla.ts:94 and actions/notifications.ts:196 (also issue-service.ts, favorites.ts, attachments.ts, customers.ts). sla.ts uses
  `'sla_breached'` (notification) and `'issue.sla_breached'` (event) with different summaries (`SLA breached` / `breached its SLA`).

**E. Event vocabulary and durability**
- [hidden] event-type strings are literals in 10+ places though `ISSUE_EVENT` exists (events.ts:28, 8 uses): dispatch.ts:33-40,165-204; integrations/slack.ts:57-61; event-types.ts:6-15;
  audit.ts:506-517; timeline.ts:50; activity-summary.ts:22; activity-line.svelte:41; cycles.ts:407; actions/sla.ts:178. `comment.updated`, `description.mentioned`, `issue.sla_breached`,
  `sentry.resolved` are not in `ISSUE_EVENT`. Fix idea: one client-safe registry.
- [needless] events.ts:26,136 — the bus imports `isWebhookDeliverable` and writes the webhook-only column `webhookPendingProjectId` into every activity row. Fix idea: subscribers register
  `{name, isDurable, run}`.
- [hidden] durability differs per subscriber: webhooks are durable (pending column + sweep + retries, outgoing-webhooks.ts:5-25); notifications, Slack and push run once in `after()` and only
  `console.error` on failure (events.ts:92-97), so a DB blip loses the inbox row. `schedule()` (events.ts:99-104) also catches any `after()` error and runs the task inline.
- [special:timer-workaround] outgoing-webhooks.ts:296,307; cron/jobs/webhook-retries.ts; actions/integrations.ts:421 — no queue, so retries are driven lazily from three places;
  `deliverWebhooks` runs `sweepPendingEvents` on every batch even when nothing is pending (extra query per mutation). Fix idea: sweep from cron and the settings page only.

**F. Smaller duplicates and dead code**
- [hidden] four provider-error mappers: github/client.ts:74, vcs/http.ts:72, import/external.ts:29, actions/import.ts:344 (different wording). actions/import.ts:341 builds `new Octokit({auth})`
  without the timeout/user-agent of github/client.ts:10 `octokitFor`. The repo-name regex exists as `splitRepo` (github/client.ts:88), `REPO_RE` (actions/import.ts:42, different charset)
  and repo-picker.svelte:23.
- [hidden] actions/github.ts:207 builds the branch URL by hand; `branchUrl('github', ...)` (vcs/providers.ts:63) does the same.
- [needless] sentry/ and import/ import from vcs/ (`hmacHex`, `requestJson`, `VcsHttpError`, `readJsonBody`, `getWebhookIntegration`) and vcs/integrations.ts owns the Sentry row type and
  `sentryIntegrationId`; "vcs" is really "third-party HTTP + integration rows". Fix idea: rename to `lib/external/`.
- [surplus] dead exports (grep incl. tests and generated wrappers): subscriptions.ts:34 `getSubscriberIds`, :60 `isSubscribed`; types.ts:23 `isNotificationType`; event-types.ts:38 `isSlackEventKind`.
  github/sync.ts:244-247 `case 'stale': return null; default: return null;`.
- [special:single-caller-param] vcs/automation.ts:164 `findIssues(..., branch?)` — one of two callers passes it.

## Special-case tally for this area

| category | count | examples |
|---|---|---|
| module-identity branch | 9 | notifications/types.ts:83; notifications/dispatch.ts:39,204; actions/developer.ts:155,207,227,328; vcs/providers.ts:30,34 |
| single-caller param | 3 | vcs/automation.ts:164; vcs/integrations.ts:99 (GITHUB_WEBHOOK_BASE_URL applied to all hosts); outgoing-webhooks.ts:443 `{retry}` |
| silent catch | 14 | github/sync.ts:181; slack/asks.ts:373,395; slack/api.ts:61; integrations/slack.ts:49; vcs/gitlab.ts:19; events.ts:102 |
| timer-workaround | 4 | outgoing-webhooks.ts:296,307; actions/integrations.ts:421; cron/index.ts:54-63 (inFlight map + timeout race) |
| copied constant | 9 | slack/api.ts:51; slack/oauth.ts:44; intake.ts:12; slack/state.ts:20; digests.ts:27 / pulse.ts:58; settings-slack.ts:20 |

## Nit counts

Section-banner comments (`// -----`) that only name the next section: actions/import.ts 10; outgoing-webhooks.ts 6; actions/github.ts 6; actions/integrations.ts 6; actions/notifications.ts 6;
github/sync.ts 4; import/mapping.ts 4; slack/asks.ts 2. Boilerplate `// Next answered OPTIONS automatically...` once in each of 10 route files.
Stale planning IDs in comments ("B1", "D10b", "GH-03", "Wave B agents", "owned by D8", "(D-04)"): ~25 across github/*, github-token.ts, events.ts, dispatch.ts, cron/jobs/*.

## Cross-area observations

- `src/lib/issue-service.ts` (`updateIssueFields`, `createIssue`, `SYSTEM_ACTOR`) is called by vcs/automation.ts, sentry/webhook.ts and slack/asks.ts; `viaPullRequest`
  (issue-service.ts:947, vcs/automation.ts:243, dispatch.ts:178) is a free-form `eventData` convention shared by three files.
- `src/lib/audit.ts:77`, `src/lib/timeline.ts:50`, `components/people/activity-summary.ts` and `comments/activity-line.svelte` each keep their own event-type to sentence map; a new event edits all.
- `src/lib/tickets.ts` (`issueQueries`, `mergeIssueRows`) is imported by integrations/event-context.ts and notifications/inbox.ts: stable event fan-out depends on the volatile issue query layer.
- `src/lib/email.ts` `sendEmail` is shared by dispatch.ts and digests.ts with an unwritten 100/day Resend budget (digests.ts:29-30); no shared limiter.
- Auth area: `auth.$context.secretConfig` is read by vcs/secrets.ts, slack/installations.ts, github-token.ts; `BETTER_AUTH_SECRET` is read directly in intake.ts:12, slack/state.ts:20, sso.ts, recurring.ts.
