# Inventory: ISSUE CORE (server side)

Scope: issue-service/model/filtering/grouping, tickets, workflow, relations, triage, sla, estimates, cycles,
automation, recurring, similarity, search, timeline, views, project-data*, sync, and the matching server actions.
Call sites checked in `src/routes/**` (project layout, recurring settings page, API v1) and `src/lib/graphql`.

## Structural findings (max 25, most important first)

**A. "Closed state" and issue-field knowledge is copied everywhere**
- [hidden] src/lib/search.ts:78,105 — "open/closed = type in (completed, canceled)" exists as `isClosed()` (workflow.ts:37) and ALSO as raw SQL/array literals in search.ts:78,105, similarity.ts:94, cycles.ts:318, automation.ts:73, server/actions/sla.ts:88, cron/jobs/sla.ts:43, insights.ts:134, project-list.server.ts:41-42, people/[userId]/+page.server.ts:82, workspaces/[slug]/+page.server.ts:74, plus issue-filtering.ts:647 (`isClosedType`, a second TS copy) and possible-duplicates.svelte:56. A new state type touches ~14 files. Fix idea: export `CLOSED_STATE_TYPES` + `openStateSql()` from workflow.ts and use them in all of these.
- [hidden] src/lib/issue-model.ts:12-16 — the issue field list lives in `IssueRow`, `IssuePatch`, `ISSUE_PATCH_FIELDS` (dead, see below), `normalizePatch` (issue-service.ts:113-170), `resolvePatch`/apply (issue-service.ts:597 field array), `createIssue` twice (issue-service.ts:833-848 insert values and 905-925 returned IssueRow), `toIssueRow` (tickets.ts:111), the optimistic placeholder (use-issue-mutations.svelte.ts:595-620), REST `serializeIssue` (routes/api/v1/_lib/api.ts:91) and GraphQL SDL (graphql/type-defs.ts). Adding one issue field is a 10-place edit with no compiler help in several. Fix idea: one field table (key, validate, column, activity label) that normalize/apply/serialize derive from; build the create-return `IssueRow` from the inserted row via `toIssueRow`.
- [hidden] src/lib/server/actions/sla.ts:88-113 — SLA deadline math exists three times: `slaDeadline` TS (issue-service.ts:226, used at 611/816/1441), raw SQL `created_at + make_interval(hours…)` here, and breach detection in cron/jobs/sla.ts:40-58 and search.ts:202-210, issue-filtering.ts:732. `applySlaPolicyToOpenIssues` also writes `tickets` directly, bypassing the issue service (no per-issue activity, no `updatedAt`), contradicting issue-service.ts:1-3 "the ONE place issues are changed". Fix idea: put "recompute SLA for issue set" in issue-service (or sla-server.ts) and have the action and cron call it.
- [hidden] src/lib/search.ts:235 and src/lib/similarity.ts:47 — the tsvector expression `to_tsvector('english', title||' '||description)` is copied in both files and must equal an index that was created inside migration `0003_seed_workflow_states.sql` (a seed migration). Three places, comment-only link. Fix idea: export one `issueDocument` SQL fragment from tickets.ts and move the index into a migration named for it.

**B. One filter language, four evaluators**
- [hidden] src/lib/issue-filtering.ts:273 / src/lib/search.ts:97 / src/lib/graphql/issue-list.ts:34 / src/lib/components/dashboards/widget-data.ts:44 — the same filter semantics (is:open, due:thisWeek, sla:risk, assignee me/none, label none, cycle current/next/previous) are implemented in a JS matcher (`issueMatcher`), a client term resolver (`resolveSearchTerms`, :770), SQL (`valueCondition`), and a separate REST/GraphQL filter (state id|name|type, assignee `me|none`) with its own spellings. Week boundaries (`weekRange` in search.ts:84 vs the JS version), `SLA_RISK_MS` (issue-filtering.ts:576 but consumed by search.ts) and `UNIT_MS` (issue-filtering.ts:578) must stay equal by hand. Saved views (`views.filters` JSON, views.ts:27) persist the IssueFilters shape, so renames also break stored rows. Fix idea: one declarative filter spec (key -> {parse, js, sql}) so each key is defined once; at least move shared constants/`weekRange` into issue-filtering.ts.

**C. Server domain code lives under `components/`**
- [hidden] src/lib/automation.ts:19, recurring.ts:23-24, cycles.ts:36-45, server/actions/{cycles,planning-settings,recurring}.ts — server code imports scheduling math and constants from `@/lib/components/cycles/cycle-utils` (DAY_MS, alignOnOrAfter, utcDay, MAX_COOLDOWN_WEEKS, AUTOMATION_MONTHS) and a DB-touching validator `sanitizeIssueDefaults` from `@/lib/components/productivity/issue-defaults.ts` (used by drafts, templates, recurring actions + recurring.ts). `automation.ts:19` even re-exports a component constant. Cycle domain is split across cycles.ts, cycle-utils.ts, actions/cycles.ts, actions/planning-settings.ts, automation.ts. Fix idea: move cycle-utils.ts to `src/lib/cycle-schedule.ts` and issue-defaults.ts to `src/lib/issue-defaults.server.ts`; components import from there.
- [hidden] src/lib/server/actions/planning-settings.ts:42-52,79 — validation ranges copied from cycle-utils.ts (`duration 1..8` vs `CYCLE_DURATIONS`, weekday 0..6) and `"26 weeks"` literal in server/actions/cycles.ts:65 next to `MAX_DAYS`. `triageEnabled` is saved by "planning settings" (:70), unrelated to planning. Fix idea: validate against the exported constants; split triage toggle into its own action.
- [needless] src/lib/cycles.ts:138,192 — `ensureUpcomingCycles(projectId, duration, now, weekday, cooldown)` / `rescheduleUpcomingCycles` take five positional scalars that are always the same project cadence (automation.ts:163, planning-settings.ts:95-97). Fix idea: pass a `CycleCadence` object.

**D. Per-action boilerplate, 20+ copies**
- [surplus] src/lib/server/actions/*.ts — `function revalidate…(projectId)` re-declared 22 times (tickets.ts:22, labels.ts:70, workflow-states.ts:102, cycles.ts:35, relations.ts:20, triage.ts:31, planning-settings.ts:32, sla.ts:27, move.ts:60-61 inline, …), with inconsistent scope: tickets/triage also revalidate `/dashboard`, labels/states/cycles/sla do not even though sidebar counts show them. Fix idea: one `revalidateProject(projectId, {sidebar})` in a shared actions helper.
- [surplus] src/lib/server/actions/{labels,workflow-states,epics,epic-labels,project-settings,invite,join,workspaces}.ts — `isUniqueViolation` redefined 8 times beside issue-service.ts:749 `hasPgCode`; `COLOR_RE`, `validateName/Color/Description` duplicated between labels.ts:18-52 and workflow-states.ts:29-95 (and epics.ts:37, epic-labels.ts:26, import.ts:40). `type Fail = {ok:false;error}` redeclared in ~12 action files. Fix idea: `src/lib/server/action-util.ts` with `isUniqueViolation`, `fail`, `hexColor`, `boundedText`.
- [hidden] src/lib/server/actions/labels.ts and workflow-states.ts — label/state CRUD runs raw Drizzle in the action layer (no service), while issues go through issue-service; the dedupe rule "lower(name) unique per project" lives only in labels.ts:55 (+ DB case-sensitive constraint). The REST/GraphQL/import/Slack paths that create labels cannot reuse it. Fix idea: a `label-service` that actions and API both call.

**E. State/key helpers copied**
- [surplus] src/lib/triage.ts:21 — `defaultAcceptState` is identical to `defaultNewIssueState` (workflow.ts:49) and has zero callers (checked ts + svelte). Delete it.
- [hidden] src/lib/relations.ts:236-249 — private `duplicateState(projectId)` re-implements triage.ts:42 `duplicateState` ("Duplicate" by name else first canceled) with its own DB query. Same rule in two modules; both match the magic name `'duplicate'` (triage.ts:25) and `'canceled'` (:34). Fix idea: relations uses `duplicateState(await loadStates(...))` from triage.ts; store the role on the state (`isDefaultDuplicate`) instead of matching names.
- [hidden] src/lib/{relations,issue-service,automation,project-data,server/actions/{triage,intake,workflow-states}}.ts (+ sentry/webhook.ts:166, slack/asks.ts:344, vcs/automation.ts:88, import.ts:195, api/v1/projects/[id]/states/+server.ts:20) — the 6-column workflow-state select is pasted 13 times; every new WorkflowState column means 13 edits. Fix idea: `workflowStateColumns` + `loadProjectStates(projectId)` in a workflow-server module (workflow-server.ts already exists for seeds).
- [needless] src/lib/issue-model.ts:81-201 — dead legacy aliases `IssueAssignee`, `parseIssueFilters`, `serializeIssueFilters`, `hasActiveFilters`, `ISSUE_PATCH_FIELDS` (zero callers repo-wide). Fix idea: delete.
- [hidden] issue key parsing — graphql/issue-key.ts:10 `{1,10}`, search.ts:56, routes/…/issues/[key]/+page.server.ts:13, server/actions/editor.ts:21, audit.ts:125 all hold their own regex with different limits; alias resolution exists twice (tickets.ts:257 `getIssueByKey` and graphql/issue-key.ts:19). Fix idea: `parseIssueKey()` + one `resolveKey` in tickets.ts.

**F. Trigger and layering oddities**
- [special:timer-workaround] src/routes/dashboard/projects/[id]/settings/recurring/+page.server.ts:26 — a GET load runs `runDueRecurringIssues` (creates issues) as a "lazy cron"; same for every project page load via `after(runProjectAutomations)` in +layout.server.ts:27 plus the daily cron/jobs/automations.ts:24 and cron/jobs/recurring.ts. Comment automation.ts:1 "no cron on the free tier" is stale since src/lib/cron exists. Failure handling is triple-wrapped (layout try/catch, `claimRun` try/catch automation.ts:189, per-`step` catch :179) while the header claims "nothing here ever throws". Fix idea: cron + self-host scheduler only; drop the load-time runs; one catch level.
- [special:swallowed] src/lib/server/actions/cycles.ts:103-108 — `catch` turns every insert failure into "someone created one at the same moment", logging only; only a (project, number) unique violation fits that message. Fix idea: check `isUniqueViolation`, rethrow otherwise.

## Special-case tally for this area

| category | count | examples |
|---|---|---|
| module-identity branch (state name/role matched by string) | 5 | triage.ts:25,34,42; relations.ts:245; issue-service.ts:1410 |
| single-caller param | 3 | tickets.ts `getIssueByKey(viewerId?)` (alias fallback only for one page); `descriptionSource?: 'collab'` (actions/tickets.ts:43); `UpdateIssueOptions` |
| silent / over-broad catch | 4 | server/actions/cycles.ts:103; views.ts:26; sync/broadcast.ts:12,21 (documented); automation.ts:189 |
| timer / retry workaround | 3 | recurring settings load (recurring/+page.server.ts:26); layout `after()` automation (+layout.server.ts:27); `claimRun` 1-day throttle (automation.ts:44) |
| copied constant | 14 | closed-state literal x11 (search.ts:78); DAY_MS x4 (cycle-utils.ts:8, cron/jobs/pulse.ts:18, widget-data.ts:13, issue-filtering.ts:580); COLOR_RE x5 (labels.ts:18, workflow-states.ts:29, epics.ts:37); LABELS_MAX (issue-defaults.ts:43); HOUR in sla.ts:60 vs issue-filtering.ts:576 |

## Nit counts

issue-service.ts: 12 restating comments, 3 style
issue-filtering.ts: 4, 3
cycles.ts: 3 comments
recurring.ts: 3 comments
search.ts: 2 comments
actions/workflow-states.ts: 2 comments, 1 style
actions/triage.ts: 2 comments
issue-model.ts: 2 stale comments
issue-links.ts: 1 stale comment (points at removed src/app path)

## Cross-area observations

- Optimistic client updates (`src/lib/components/issues/use-issue-mutations.svelte.ts:595-640`, `applyIssuePatch`) rebuild IssueRow, SLA reset and state timestamps client-side; they must track `issue-service.ts` resolvePatch (SLA, stateChangedAt, epic/milestone clearing).
- REST `src/routes/api/v1/_lib/api.ts:91 serializeIssue`, `src/lib/graphql/{type-defs,resolvers}.ts` and the planned MCP server (docs/mcp) each map IssueRow by hand; `graphql/issue-list.ts` is a fourth filter dialect (see B).
- `src/lib/cron/jobs/{sla,automations,recurring}.ts` and `src/lib/vcs/automation.ts` own parts of the issue lifecycle (SLA breach, auto-close, PR-merge state moves) beside issue-service; they pick states via `declineState`/`firstStateOfType` in triage.ts/workflow.ts.
- `src/lib/components/productivity/issue-defaults.ts` and `components/cycles/cycle-utils.ts` are server dependencies hidden in components (area C); `components/epics/epic-model.ts` (EPIC_DESCRIPTION_MAX, isClosedEpic) is the same pattern for epics, and `EpicStatus`/`EpicSummary` live in project-data-types.ts instead.
