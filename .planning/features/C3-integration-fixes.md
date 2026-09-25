# C3 — Data-layer integration fixes (Wave C)

Wires migration `0005` (`project.slack_events`, `project.cycle_start_weekday`,
`project.cycle_auto_rollover`, `workspace_invitation`) and fixes the queued
dispatcher issues. One line per fix, then the details that matter.

1. **Slack events column** — `parseSlackSetting(url, events)` / `normalizeSlackEvents(events)`
   read `project.slack_events`; the URL fragment is legacy-read only.
2. **Cycle weekday + auto-rollover** — `project.cycle_start_weekday` replaces
   `deriveStartWeekday`; `project.cycle_auto_rollover` gates rollover in the
   daily automation. Planning form gets a rollover switch.
3. **Bulk-import noise** — `createIssue(actor, projectId, input, { source: 'import' })`
   marks `issue.created` with `data.bulk: true`; Slack, webhooks and notifications
   skip bulk events (notifications still auto-subscribe creator / assignee).
4. **Project-level events** (`ticketId: null`) — notifications already ignored
   them; Slack never maps them to a kind; outgoing webhooks now deliver a
   ticket-less event only when it's a listed webhook type (`issue.purged`).
5. **PR-merge double notification** — the merge-driven state change carries
   `data.viaPullRequest`; dispatch skips the status/completed notification for
   it (subscribers already got "Merged PR #N"). Activity rows unchanged.
6. **Workspace invitations table** — HMAC tokens replaced by `workspace_invitation`
   rows: invite / resend / revoke / copy link, pending list on the workspace
   page, single-use accept at `/invite/workspace/[token]`.

## 1. Slack
- Save writes `slackWebhookUrl` = bare URL and `slackEvents` = selected kinds
  (canonical order). Disconnect clears both. Saving always strips a legacy
  fragment, so the migration happens on the next save.
- Read: `slackEvents` non-null → it; else a legacy `#events=` fragment → its
  kinds; else all kinds. The URL returned is always fragment-free.

## 2. Cycles
- `ensureUpcomingCycles(projectId, weeks, now, weekday)` — weekday required
  (project column). Existing cadence still continues from the latest cycle's
  end while cycles are open; a fresh cadence aligns to the column's weekday.
- Planning save: cadence changed = duration or `cycleStartWeekday` differs
  from the stored column → `rescheduleUpcomingCycles` (behaviour unchanged).
- `completeEndedCycles(actor, projectId, now, { rollover })` — ended cycles
  still auto-complete; unfinished issues move only when rollover is on.
- Form: "Starts on" select (already there, now persisted) + "Move unfinished
  issues" switch.

## 3–5. Dispatchers
- `data.bulk === true` → Slack and webhooks drop the event (documented: imports
  don't fire webhooks or Slack); notifications keep the auto-subscribe side
  effect but create no inbox rows / emails.
- `updateIssueFields` / `bulkUpdate` gain an optional `opts.eventData` (merged
  into `issue.updated` data) — additive, used only by the GitHub sync.
- Sync passes `viaPullRequest: {number,url,repo}` only for issues whose
  `github.pr_merged` event was emitted in the same delivery, so a redelivery
  that re-closes a reopened issue still notifies.

## 6. Workspace invitations
- `inviteWorkspaceMember`: co-member path unchanged; otherwise delete any
  pending row for (workspace, email), insert a new one (32-byte base64url
  token, 7-day expiry, role, invitedBy), email the link. Same reply shape.
- `resendWorkspaceInvitation` (new expiry, same token, email again),
  `revokeWorkspaceInvitation` — admin+; admins can only manage member-role
  invitations (owner manages all), mirroring role rules.
- Accept: token lookup (unexpired, unaccepted) → email must match → claim with
  `UPDATE … WHERE accepted_at IS NULL AND expires_at > now() RETURNING` →
  idempotent `onConflictDoNothing` membership insert (un-claim on failure).
- Workspace page loads pending invitations (admins only) and passes them to
  `WorkspaceMembers`, which lists them with Resend / Copy link / Revoke.
- `signWorkspaceInvite` / `verifyWorkspaceInvite` removed (no other users).

## Edge cases
Legacy fragment URL with `slackEvents` null → fragment wins until saved.
Revoked / accepted / expired tokens → generic "invalid". Already a member when
accepting → invitation consumed, redirect to the workspace. Workspace deleted →
invitations cascade.
