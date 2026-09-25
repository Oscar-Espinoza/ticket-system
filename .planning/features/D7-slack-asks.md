# D7 — Linear Asks (Slack app intake)

## Goal
File issues from Slack: `/ask <text>` and a "Create issue" message shortcut open a
modal; submitting creates the issue and replies ephemerally with its link. This is a
Slack *app* (OAuth, bot token), separate from B11's per-project incoming webhook.

## UX
- **Settings → Slack** (`/dashboard/settings/slack`). Env unset → "Set up the Slack
  app" card: the exact request URLs, a copyable app manifest (scopes, `/ask`, the
  message shortcut, interactivity, events, redirect URL) and the three env vars.
  Configured → "Add to Slack" button; connected workspaces (those the viewer
  installed or is linked to): name, "Asks go to" project select (projects the
  viewer admins), Uninstall (confirm). Collapsed "App configuration" details keep the
  URLs/manifest reachable.
- **Slack**: `/ask Login page 500s` → modal (Title prefilled from the first line,
  Description from the rest, Project select, Priority select). Message shortcut →
  same modal, title = first line of the message, description = message text +
  permalink. Submit closes the modal; a moment later an ephemeral "Created
  <APP-12 Title>" (via `response_url`, falling back to a DM).

## Data / actions
- `slack_installation` (bot token encrypted with Better Auth `symmetricEncrypt`),
  `customer_request` (`source: 'slack'`, Slack name/email from `users.info`).
- Routes: `GET /api/slack/install` (session; signed state + nonce cookie →
  `oauth/v2/authorize`), `GET /api/slack/oauth/callback` (install and account link),
  `POST /api/slack/commands`, `POST /api/slack/interactivity`, `POST /api/slack/events`
  (`url_verification`, `app_uninstalled` / `tokens_revoked` → delete the install).
- Every POST verifies `X-Slack-Signature` (v0 HMAC-SHA256 of `v0:ts:body`, ≤ 5 min,
  timing-safe) before parsing; acks at once, work runs in `after()`.
- Project options: linked Slack user → projects where their app user can write
  (≤ 100); unlinked → only the install's default project.
- Create: linked → `createIssue({userId}, …)` after re-checking write access;
  unlinked → `SYSTEM_ACTOR`, default project only. Triage state when the project has
  triage on, else the default new-issue state. Description gets an "Asked in Slack by
  … · View message" footer.
- Server actions (`settings/slack/actions.ts`): `setSlackDefaultProject`,
  `uninstallSlack` (calls `apps.uninstall`, deletes install + links).

## Files
`src/lib/slack/{config,signature,api,state,installations,asks}.ts`,
`src/app/api/slack/{install,oauth/callback,commands,interactivity,events}/route.ts`,
`src/app/dashboard/settings/slack/{page,actions}.tsx|ts`, `src/components/slack/*`.

## Edge cases
Unknown team / bad signature → 401 with no detail. Unlinked + no default project →
ephemeral "link your account / ask an admin". Title ≤ 200, description ≤ 3000 in the
modal (Slack limit) and `DESCRIPTION_MAX` overall. Project removed or access lost
between modal and submit → ephemeral error. Default project can only be changed by an
admin of the new project who is the installer or also admins the current default.
Rate-limited / failed Slack calls are logged, never thrown.
