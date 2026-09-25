# B3 — GitHub webhook registration

## Goal
Connecting a repo registers a per-project webhook (GH-03) so PR / push events
reach `/api/webhooks/github`.

## Flow (`registerWebhook` in `src/lib/github/webhooks.ts`, called by
`connectRepository` and the "Register webhook" retry action)
- URL: `${GITHUB_WEBHOOK_BASE_URL ?? NEXT_PUBLIC_APP_URL}/api/webhooks/github`.
  Optional `GITHUB_WEBHOOK_BASE_URL` lets local dev point GitHub at a tunnel
  while auth stays on localhost.
- localhost / 127.x / private hosts → skip registration and return a warning
  (GitHub can't deliver there); settings shows it in an amber callout.
- secret = 32 random bytes hex, saved to `project.githubWebhookSecret` BEFORE
  the hook is created (GitHub's immediate `ping` must verify); then id →
  `githubWebhookId`. Events: `pull_request`, `push`; content type json. On
  failure both are cleared.
- Re-register deletes the previous hook first (404 ignored).
- Disconnect deletes the hook and clears repo / webhook id / secret.

## Edge cases
No admin on repo → GitHub 404/403 → "You need admin access to <repo> to add a
webhook". Hook already exists with same URL (422) → surface GitHub's message.
