# D10b — GitLab / Bitbucket

## Goal
Projects hosted on GitLab (cloud or self-hosted) or Bitbucket Cloud get the same
PR automation GitHub has: issues link to merge/pull requests by key or magic
word, move on open/merge, and default-branch commits with closing words close
issues.

## UX
Settings → GitLab, Bitbucket & Sentry (`settings/developer`, admins edit, others read):
- **GitLab**: base URL (default `https://gitlab.com`), project path
  (`group/sub/project`), access token (`api` scope, personal or project token).
  Connect → validates the token against the project, registers a project hook
  (MR, push, pipeline events) with a random secret sent as `X-Gitlab-Token`.
- **Bitbucket Cloud**: `workspace/repo`, access token (repository/workspace
  access token → Bearer; or an API token / app password + username → Basic).
  Connect registers a repo webhook with a secret (Bitbucket signs with
  `X-Hub-Signature: sha256=…`).
- Connected card: repo link, "Webhook active / not registered", Register
  webhook again, Disconnect (removes the hook best effort, deletes the row).
- Automation uses the project's PR automation states from Settings → GitHub.
- Unreachable webhook URL (localhost) → warning explaining NEXT_PUBLIC_APP_URL /
  GITHUB_WEBHOOK_BASE_URL.
- Issue header branch menu is provider-agnostic: provider mark, "Open branch on
  GitLab/Bitbucket", and "Create branch on GitHub" only when GitHub is connected.

## Data / actions
- `project_integration` row per provider: `token` = `symmetricEncrypt`ed,
  `secret` = webhook secret, `config` = { baseUrl, repo, remoteId, webUrl,
  defaultBranch, webhookId, username }.
- Actions (`src/app/actions/developer.ts`, admin): `connectGitlab`,
  `connectBitbucket`, `registerVcsWebhook`, `disconnectIntegration`;
  `getVcsConnections` (read) for the header.
- Webhooks: `/api/webhooks/gitlab/[integrationId]`, `/api/webhooks/bitbucket/[integrationId]`
  — look up exactly one row, timing-safe secret/HMAC check, 202 + `after()`.
- Shared engine `src/lib/vcs/automation.ts` (factored out of `lib/github/sync.ts`,
  GitHub now an adapter): `syncPullRequest(project, pr, trigger)`,
  `syncClosingCommits`, `updatePullRequestStatus`. PRs stored in
  `github_pull_request` with `provider`. Event types reuse `github.*` (so
  notifications keep working) with `data.provider` + `data.actorName`.

## Edge cases
- Self-hosted base URL must be http(s) and not a loopback/private literal (SSRF).
- Token never returned to the client; decrypt failure → "reconnect" message.
- Same repo path on two providers: lookups include `provider`.
- MR `!iid` (GitLab) vs `#id` display.
- Redeliveries idempotent (events only on transitions, as for GitHub).
