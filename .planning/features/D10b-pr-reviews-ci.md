# D10b — PR review and CI status on issues

## Goal
Linked pull requests show whether they're approved / need changes / await
review, and whether CI passes, fails or is running.

## UX
`SectionPullRequests` rows: state icon, `#12`/`!12`, title, review badge
(Approved green / Changes requested red / Review required muted), CI glyph
(check green / x red / dot amber, tooltip "Checks passing|failing|pending"),
provider-aware repo, author, updated time. Settings → GitHub: when the
registered webhook lacks the new events, a callout with **Update webhook**
(edits the hook's events in place, secret unchanged).

## Data
`github_pull_request.reviewDecision` ('approved'|'changes_requested'|'review_required'|null),
`checksState` ('pending'|'success'|'failure'|null).

- **GitHub**: `WEBHOOK_EVENTS` += `pull_request_review`, `check_suite`,
  `check_run`, `status`. Review decision: with the connecting admin's token,
  list the PR's reviews (latest non-comment review per user); otherwise derive
  from the delivered review. `review_requested` on a PR with no decision →
  review_required. Checks: with the token, combine `checks.listForRef` +
  `getCombinedStatusForRef` for the head sha; otherwise the delivered
  conclusion. `synchronize` resets a known CI state to pending.
- **GitLab**: MR `approved`/`unapproved` actions; Pipeline Hook status
  (by MR iid, else source branch of open MRs).
- **Bitbucket**: participants' approved / changes_requested on every PR event;
  `repo:commit_status_*` → combine all statuses of the commit (stored token),
  matched by branch (`refname`) of open PRs.
- Actions: `getPullRequests` (read, developer.ts), `getGithubWebhookHealth`,
  `updateGithubWebhookEvents` (admin).

## Edge cases
- Status updates only touch rows of the verified project + provider + repo.
- Events for PRs never linked do nothing. No activity events for CI (noise).
- Old webhooks keep working; they just don't send review/CI events.
