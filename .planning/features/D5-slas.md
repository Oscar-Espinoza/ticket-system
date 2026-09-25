# D5 — SLAs

## Goal
Response targets per priority. `project.slaPolicy` = `{ priority: hours }`;
the issue service already sets `ticket.slaDueAt` on create / priority change.

## UX
- **Settings → SLAs** (admins edit): one row per priority (urgent, high,
  medium, low): amount + unit (hours / days); empty = no SLA. Save. "Apply to
  open issues" (confirm) recomputes deadlines of open issues from their
  creation time — otherwise the policy only affects new issues and priority
  changes.
- **IssueDetail `PropertySla`**: "SLA" row — "2d 4h left" (green), amber when
  under a quarter of the window (or < 1h) is left, red "Overdue by 3h" /
  "Breached". Closed issues: "Met" / "Breached" muted. Hidden without slaDueAt.
- **`SlaChip`** (D8 rows / cards / table): compact "2d left" / "5h left" /
  "Breached", same colors, null when no SLA or closed.

## Data / actions
- `src/lib/sla.ts` (client-safe): `SLA_PRIORITIES`, `normalizeSlaPolicy`,
  `slaStatus(issue, now)` → `{ kind: 'ok'|'risk'|'breached'|'met'|'missed', remaining }`,
  `formatDuration`.
- Actions `src/app/actions/sla.ts` (admin): `updateSlaPolicy`,
  `applySlaPolicyToOpenIssues` — one SQL update over open, active issues:
  `sla_due_at = created_at + hours`, `sla_breached_at` kept / set to now when
  already past (no notification burst), null otherwise; one project-level
  `sla.policy_applied` event with `data.summary`.
- Cron `src/lib/cron/jobs/sla.ts`: open active issues with `sla_due_at <= now`
  and `sla_breached_at is null` → claim with `update … where sla_breached_at is
  null returning` (idempotent), emit `issue.sla_breached` activity
  (`{key,title,summary}`), insert `notification` rows type `sla_breached` for
  the assignee + subscribers who are still project members and haven't turned
  the type off, then `deliverToChannels(rows)`. Batches of 500.

## Edge cases
Completed / canceled issues never breach (job skips them). Priority change
restarts the clock (service). Hours 1–8760. Unknown priorities ignored.
