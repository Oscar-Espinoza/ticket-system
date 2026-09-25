# B3 — Auto status on PR opened / merged

## Goal
Issue status follows real GitHub work (GH-04/05/06) without polling.

## Settings (Automations section)
Two Selects: "When a pull request is opened" → `githubPrOpenStateId`, "When a
pull request is merged" → `githubPrMergeStateId`. Values: any workflow state or
"No action". Storage: `null` = default (resolved at runtime: open → first
started state named "In Review" else last started; merge → first completed),
`'none'` = disabled. Action `updateGithubAutomation(projectId, {open, merge})`
admin, validates ids belong to the project.

## Webhook route (`src/app/api/webhooks/github/route.ts`)
- Read raw body; project = by `X-GitHub-Hook-ID` = `githubWebhookId`, else by
  `repository.full_name` (case-insensitive). Verify `X-Hub-Signature-256`
  (HMAC-SHA256, timingSafeEqual) against each candidate's secret; none → 401.
- `ping` → 200. Other events → 202 immediately; work runs in `after()`.
- `pull_request` (opened, reopened, ready_for_review, edited, synchronize,
  converted_to_draft, closed): resolve references (B3-magic-words), upsert
  `github_pull_request` rows per linked issue, emit `github.pr_linked` for new
  links, `github.pr_merged` / `github.pr_closed` on transitions (actor null,
  `data.summary`, key, title, number, url, repo).
- State moves via `updateIssueFields(SYSTEM_ACTOR, …)` for the "auto" set only:
  open (not draft) → open-state if the issue's state sorts before the target and
  it isn't closed; merged → merge-state unless already completed/canceled.
  Closed-unmerged: no state change.
- `push` to the default branch → commits with closing words move issues to the
  merge state; emits `github.commit_closed`.

## Edge cases
Redeliveries are idempotent (upsert on ticket+repo+number; events only on
transitions). Trashed issues ignored; archived still link. Errors logged.
