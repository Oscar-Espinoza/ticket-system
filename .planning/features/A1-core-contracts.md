# A1 — Core contracts

## Goal
One set of shared building blocks every Wave B agent consumes: domain types,
authorization, reads, writes (service layer + thin actions), project data
context, events, grouping/display options, pickers and slot hosts.

## Data / server
- `src/lib/issue-model.ts` — client-safe domain types + filter helpers.
- `src/lib/roles.ts` — `ProjectRole`, `AccessLevel`, `roleAllows` (client-safe).
- `src/lib/action-auth.ts` — `authorizeProjectAction(projectId, level)`
  (session + membership + role, built on `requireProjectMember`).
- `src/lib/tickets.ts` — `queryIssues(where, opts)` (one `db.batch`: rows + labels),
  `getProjectIssues`, `getTicketById`, `getIssueByKey`, exported join aliases.
- `src/lib/project-data.ts` — `getProjectData(projectId, userId)` (React `cache`,
  one batch, null for non-members). Types in `src/lib/project-data-types.ts`.
- `src/lib/issue-service.ts` — session-less writes (`createIssue`,
  `updateIssueFields`, `bulkUpdate`, `archive`, `unarchive`, `softDelete`,
  `restore`, `purge`), explicit `actor`, validation of every referenced id
  against the project, `emitIssueEvent`. **No auth, no revalidate** — callers
  (actions, API routes, webhooks, automations) authorize first.
- `src/app/actions/tickets.ts` — thin wrappers: authorize → service → revalidate.
- `src/lib/events.ts` — `emitIssueEvent` writes `activity` rows, then `after()`
  fans out to notifications / Slack / outgoing webhooks (stubs, Wave B).
- `src/lib/email.ts` — `sendEmail` via Resend REST or console.
- Small client-safe helpers: `lib/roles.ts` (role → level), `lib/dates.ts`
  (due-date strings), `lib/estimates.ts`, `lib/issue-links.ts` (`issuePath`).

## Client
- `ProjectDataProvider` / `useProjectData()` mounted by the project layout.
- `useIssueMutations(serverIssues, opts?)` + pure `applyIssuePatch`.
- `groupIssues()` (`state`, `none` implemented) + `DisplayOptionsProvider`.
- Pickers in `src/components/issue-pickers/` (popover + bare `…Options`).
- Slot stubs: `issue-detail/slots/*`, `issues/slots/*`, `project/slots/*`;
  `lib/automation.ts` stub run from the project layout's `after()`.

## Edge cases
- Non-member → layout `notFound()`; every read is membership-gated in SQL.
- Referenced ids from another project → "Invalid …" errors, nothing written.
- Event insert / dispatcher failures are logged, never fail the mutation.
- `after()` outside a request (scripts/tests) → fan-out runs inline, un-awaited.
