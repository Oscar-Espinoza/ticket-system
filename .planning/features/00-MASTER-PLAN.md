# Linear Parity — Master Plan

Source checklist: `.planning/LINEAR-FEATURE-GAPS.md`. Branch: `feat/linear-parity`
(one commit per wave). Every feature gets its own plan doc in `.planning/features/`
(`<wave><agent>-<slug>.md`) written **before** implementation.

## Naming

- App **Project** = Linear **team** (issue key, members, workflow). Routes stay
  `/dashboard/projects/[id]`.
- Linear **Projects** = **Epics** here (with **Milestones**, **Epic updates**).
- **Initiatives** group epics and live in a **Workspace** (optional grouping of projects).

## Data model (done — Wave 0)

`src/db/schema.ts` + migrations `0002` (additive), `0003` (seed workflow states,
map legacy status, full-text GIN indexes), `0004` (drop legacy `ticket.status`).
Nobody edits `schema.ts` or runs `drizzle-kit` except the orchestrator. If a
feature truly needs a schema change, stop and report it.

Key tables: `workflow_state` (per-project custom states, `type` ∈ triage |
backlog | unstarted | started | completed | canceled), `label`/`issue_label`,
ticket columns (`state_id`, `priority`, `estimate`, `due_date`, `creator_id`,
`parent_id`, `sort_order`, `cycle_id`, `epic_id`, `milestone_id`,
`started/completed/canceled/archived/deleted_at`), `issue_relation`,
`issue_subscriber`, `comment`/`comment_reaction`, `attachment`/`attachment_blob`,
`activity` (audit log), `notification`, `cycle`, `epic`/`milestone`/`epic_update`,
`initiative`, `workspace`/`workspace_member`, `saved_view`, `favorite`,
`issue_template`, `issue_draft`, `user_profile`, `presence`, `api_key`, `webhook`,
`github_pull_request`, `customer_request`. Project columns cover cycles, triage,
estimates, automations, intake, Slack and GitHub settings.

Default states (keep in sync with migration 0003 and `src/lib/workflow.ts`):
Triage(triage) · Backlog(backlog) · Todo(unstarted) · In Progress(started) ·
In Review(started) · Done(completed) · Canceled(canceled) · Duplicate(canceled).

## Contracts (built in Wave A by the core agent — everyone else consumes them)

| Contract | File | Notes |
|---|---|---|
| Domain types | `src/lib/issue-model.ts` | `StateType`, `WorkflowState`, `Priority`, `IssueLabel`, `IssueUser` (= `IssueAssignee`), `IssueRow`, `IssuePatch`, filters |
| Workflow helpers | `src/lib/workflow.ts` | `DEFAULT_WORKFLOW_STATES`, type ordering, `seedWorkflowStates(projectId)` |
| Estimates | `src/lib/estimates.ts` | scale → allowed values + labels |
| Issue reads | `src/lib/tickets.ts` | `getProjectIssues`, `getTicketById`, `getIssueByKey`, `toIssueRow` |
| Project data | `src/lib/project-data.ts` + `src/components/project/project-data.tsx` | server loader + client `ProjectDataProvider` / `useProjectData()` (project, states, labels, members, cycles, epics+milestones, viewer) |
| Action auth | `src/lib/action-auth.ts` | `authorizeProjectAction(projectId, level)` level ∈ read / comment / write / admin; roles owner, admin, member, guest |
| Issue actions | `src/app/actions/tickets.ts` | `createTicket`, `updateIssue`, `bulkUpdateIssues`, `archiveIssue`, `deleteTicket` (soft), `restoreIssue`, `purgeIssue` |
| Label actions | `src/app/actions/labels.ts` | create / update / delete label |
| Event bus | `src/lib/events.ts` | `emitIssueEvent(events)` → writes `activity` rows, then `after()` fans out to the dispatchers below |
| Dispatchers (stubs) | `src/lib/notifications/dispatch.ts`, `src/lib/integrations/slack.ts`, `src/lib/integrations/outgoing-webhooks.ts` | owned by Wave B agents |
| Email | `src/lib/email.ts` | `sendEmail({to, subject, text, html})` via Resend REST if `RESEND_API_KEY` set, else logs |
| Client mutations | `src/components/issues/use-issue-mutations.ts` | optimistic `create`, `update(issue, patch)`, `bulkUpdate`, `archive`, `remove`, `restore` |
| Grouping/display | `src/lib/issue-grouping.ts`, `src/components/issues/display-options.tsx` | `groupIssues()` → `IssueGroup{id,label,patch,…}`; `useDisplayOptions()` |
| Pickers | `src/components/issue-pickers/*` | state, priority, assignee, labels, estimate, due date (reused everywhere) |
| Slots (stubs) | `src/components/issue-detail/slots/*`, `src/components/app-shell/slots/*`, `src/components/issues/slots/*`, `src/components/project/slots/*` | one file per owning agent; the host component that renders them is frozen after Wave A |

Events: `activity.type` strings — `issue.created`, `issue.updated`
(`data.changes: {field, from, to}[]`), `issue.archived`, `issue.unarchived`,
`issue.deleted`, `issue.restored`, `comment.created` (`data.mentions: userId[]`),
plus whatever Wave B agents add (`relation.*`, `attachment.*`, `github.*`, …).

## Waves and file ownership

Agents share one working tree, so **file ownership is strict**: an agent edits
only the files and directories it owns, plus new files it creates. Verification
is `npx tsc --noEmit --incremental false` filtered to your own paths, plus
`npx eslint <your files>`. No `next build`, `next dev`, `drizzle-kit`, DB writes,
package installs or git commands. No new tests.

### Wave A (parallel)
- **A1 core** — workflow-state refactor, all issue properties data + UI (priority,
  labels, estimates, due dates, canceled/duplicate), archive/trash actions, contracts
  above, detail/list/board/new-issue refactor, slot stubs.
- **A2 shell** — sidebar + project tabs, account settings (profile editing, theme /
  appearance), settings scaffolds, project settings General (rename, key,
  description, delete), stub pages for every Wave B route.

### Wave B (parallel, after A)
| Agent | Features |
|---|---|
| B1 collaboration | markdown editor, comments, reactions, @mentions, activity history, subscribers |
| B2 notifications | inbox, notifications (in-app + email), notification preferences, reminders / snooze |
| B3 github | connect repo UI, create branch, copy branch name, webhook registration, PR open/merge automation, linked PRs, magic words |
| B4 hierarchy | sub-issues, parent issue, relations, attachments |
| B5 views engine | filters (all properties), group by, sub-grouping, sort, display options, table view, calendar view, manual sort order |
| B6 navigation | My Issues, custom saved views, favorites, full-text search, archive page, trash / restore page, issue permalink page, peek preview |
| B7 cycles | cycles, burndown / velocity, triage, auto-archive / auto-close |
| B8 epics | epics, milestones, initiatives, roadmap timeline, epic updates / health |
| B9 workspace | workspaces, roles (admin / guest), email invitations, member profile pages, workflow settings UI, labels settings UI |
| B10 productivity | drafts, create more, templates, undo, copy link / ID, per-issue shortcuts, issue palette commands |
| B11 integrations | Slack, public API + API keys, outgoing webhooks, customer requests / intake forms |
| B12 data & realtime | CSV import / export, import from Jira / GitHub Issues, insights, PWA + offline, real-time updates, presence |

### Wave C
Bulk select + multi-edit (touches list/board after B5), integration fixes,
`next build`, lint, checklist update.

## External-service decisions ($0 budget)

- Email: Resend free tier via REST, only when `RESEND_API_KEY` is set; otherwise logged.
- Attachments: stored base64 in Postgres (`attachment_blob`), 5 MB cap.
- Real-time + presence: polling a cheap change-token endpoint (no websockets on Vercel Hobby).
- Automations / reminders: run lazily on page load (throttled), not by cron.
- Mobile app: installable PWA + offline shell (no native app).
- Jira import: from Jira's CSV export. GitHub Issues import: via the user's token.
