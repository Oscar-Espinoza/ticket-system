# B3 — Connect repo UI (Settings → GitHub)

## Goal
A project admin links their GitHub account with elevated scopes, picks one of
their repositories and connects it to the project (per-user OAuth token, never a
shared PAT — GH-01).

## UX
`/dashboard/projects/[id]/settings/github`, three stacked sections:
1. **Account** — "Not connected" / "Connected as @login" + granted scopes as
   chips. Missing `repo` or `admin:repo_hook` → "Grant repository access" button.
   Button calls `authClient.linkSocial({ provider: 'github', scopes: ['repo',
   'admin:repo_hook'], callbackURL: <this page> })` — same OAuth app, the link
   flow updates the existing account row's token + scope.
2. **Repository** — when unset: searchable Popover+Command of the user's repos
   (100 most recently pushed; typing `owner/name` also offers that literal) →
   Connect. When set: repo link, webhook status (registered / not registered),
   "Register webhook" retry, "Disconnect" (AlertDialog).
3. **Automations** (see B3-webhook-registration / B3-pr-automation).
Non-admins see a read-only notice (actions re-check the role).

## Data / actions (`src/app/actions/github.ts`)
- `listGithubRepos(projectId)` admin → `{ fullName, private, admin, pushedAt }[]`
- `connectRepository(projectId, fullName)` admin → verify access via `repos.get`,
  save `githubRepo`, `githubConnectedById`, then register the webhook.
- `disconnectRepository(projectId)` admin → delete webhook (404 ignored), clear
  repo / webhook / secret / connectedBy.
- Page loads the account status server-side (`getGithubAccount(userId)` in
  `src/lib/github/client.ts`: `GET /user`, scopes from `x-oauth-scopes`).

## Auth changes (`src/lib/auth.ts`)
- `account.encryptOAuthTokens: true` (AES via Better Auth's symmetricEncrypt).
  `getGitHubToken` decrypts at the D-04 seam; legacy plaintext `gho_…` tokens
  still pass through (not hex, not `$ba$`).
- `account.accountLinking.allowDifferentEmails: true` — email/password users
  often have a different GitHub email; linking is session-bound so this is safe.

## Edge cases
Token revoked (401) → "Reconnect GitHub". Repo without admin rights → webhook
step fails with a clear message but the repo stays connected (branches still
work). Changing repo = disconnect then connect.
