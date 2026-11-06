# Inventory: other domain modules

Paths are relative to src/lib unless noted. "actions/" = server/actions/.

## Structural findings (max 25, most important first)

**A. Domain models live in components/ but server code owns them (the 33 dep-base violations)**
- [needless] components/{epics/epic-model,initiatives/initiative-model,documents/document-model,customers/customer-model,dashboards/widget-model,issue-hierarchy/attachment-utils,cycles/cycle-utils,recurring/schedule}.ts — React/Svelte-free types, limits, validators and path helpers whose main consumers are epics.ts, initiatives.ts, documents.ts, customers.ts, dashboards.ts, attachments.ts, uploads.ts, cycles.ts, recurring.ts, automation.ts and 10 actions files: a stable server layer imports up into the UI tree. lib/issue-model.ts, roles.ts and workflow.ts already show the right home. They change with the domain (a new epic field touches epics.ts, epic-model.ts, actions/epics.ts), not with the UI. Moving them rewrites about 70 imports (31 in components/epics, 12 in customers). Fix idea: lib/<domain>-model.ts; leave UI-only pieces behind.
- [hidden] components/productivity/issue-defaults.ts:1 — header says "Server-only (imports db)", sits under components/ next to UI code; only recurring.ts and actions/{drafts,recurring,templates}.ts import it. A svelte file importing it would pull `db` into the client bundle with no lint to stop it. Fix idea: move to lib/ (e.g. lib/issue-defaults.ts) beside lib/recurring.ts.
- [needless] components/documents/document-model.ts:141 — `downloadMarkdown` (DOM/Blob) and `slugify` share a file with `CONTENT_MAX`, `documentsPath`, `DOCUMENT_TEMPLATES` that actions/documents.ts and documents.ts import. Browser-only code in a module the server imports; any change to the download helper re-versions the server model. Fix idea: split the download helper into the one svelte component that uses it (document-view.svelte).
- [surplus] components/editor/editor-issue.ts:1 — second definition of `EditorIssue`, byte-identical to components/editor/context.svelte.ts:19; the comment ("shared by the React and Svelte editors") is stale. Only actions/editor.ts:9 imports it, so the action and the editor can drift apart. Fix idea: delete editor-issue.ts, import the type from the editor (or make context.svelte.ts re-export a single one).
- [needless] components/dashboards/widget-data.ts:5 — client code type-imports `BreakdownRow, WeekPoint` from lib/insights.ts, a db-importing server module; one accidental value import ships drizzle to the browser. Fix idea: move the result types and INSIGHT_RANGES into an insights-model.

**B. The same project-scoped CRUD scaffolding copied per feature**
- [hidden] actions/epics.ts:33-35, actions/customers.ts:35-37, actions/initiatives.ts:31 (+ epic-relations.ts:21, epic-labels.ts:23 with inline literals, documents.ts:23 `DocumentActionResult`, dashboards.ts:21, project-templates.ts:36-44) — each file re-declares `Fail`/`fail`/`isFail` and its own `XActionResult` union, plus `name()`/`validName()`/`validateName()`/`cleanTitle()`/`cleanName()` (trim, empty check, max). They must stay shape-compatible because UI forms read `result.error` / `result.field` uniformly. Fix idea: one lib/server/action-result.ts (`ActionResult<T>`, `fail`, `isFail`, `requiredText(value,max,field)`, `optionalText`, `optionalDate`) and delete the copies.
- [hidden] actions/epics.ts:52,59 `optionalText`/`optionalDate` vs actions/initiatives.ts:70-95 (inline description/targetDate checks, uses EPIC_DESCRIPTION_MAX for an initiative) vs actions/customers.ts `validAmount`/notes check — the same "null, string<=max, blank->null" rule written 3 times with the initiative reusing an epic constant. Changing the blank-to-null rule means 3 edits. Fix idea: same shared validators; give initiatives its own limit.
- [hidden] actions/epics.ts:64 and actions/customers.ts:131 `isProjectMember`, actions/initiatives.ts:51 `isWorkspaceMember`, epic-relations/epic-labels lookups — exact-copy membership probes. Fix idea: use lib/project-access.ts / lib/workspace-access.ts (one `isProjectMember(projectId,userId)`).
- [hidden] epics.ts:65 `viewerIsMember`, customers.ts:36 `viewerIsMember`, documents.ts:22 `viewerIsMember` (alias 'doc_viewer'), tickets.ts:210 `memberOfIssueProject`, dashboards.ts:40 `member` EXISTS, views.ts:34 `view_viewer`, issue-service.ts:293, initiatives.ts:32 `workspaceMember` — 8 copies of the "correlated EXISTS membership" authorization predicate. This is the cross-tenant access filter; a change (e.g. suspended members, guest rule) must be made in every copy or one read leaks. initiatives.ts and favorites.ts already import epics.ts's copy, others do not. Fix idea: one `projectMemberOf(column, userId)` in lib/project-access.ts, one workspace variant, used by all reads.
- [hidden] id-shape rule: actions/documents.ts:13 `ID` and documents.ts:20 `DOC_ID` (identical regex), actions/customers.ts:45 `isId` (length only), mentions.ts:7 (same class inline), collab/codec.ts:15 (implicit). Fix idea: one `isEntityId`.
- [hidden] revalidatePath: `/dashboard/projects/${id}` + 'layout' is hand-written in 34 action lines (epics.ts:42, epic-labels.ts:77, epic-relations.ts:25, attachments.ts:41,56, customers.ts:42) and in 24 UI/route files. Path helpers exist (`customersPath`, `epicPath`, `documentsPath`, `initiativesPath`) but actions mostly ignore them (customers.ts:42 despite importing the model). Fix idea: `revalidateProject(projectId)` helper using those path helpers.
- [hidden] `isUniqueViolation` (code 23505) copied in epic-labels.ts:60, epic-relations.ts:28 and 8 other action files (join, workflow-states, invite, project-settings, labels, workspaces, plus issue-service.ts:749 using a `hasPgCode`). Fix idea: export one `isUniqueViolation` from lib/db.ts (`hasPgCode` already exists).
- [hidden] `COLOR_RE = /^#[0-9a-fA-F]{6}$/` copied in actions/epics.ts:37, actions/epic-labels.ts:26 (+ labels.ts:18, workflow-states.ts:29, routes/api/collab/[key]/+server.ts:56). A swatch-format change (alpha, named colors) needs 5 edits. Fix idea: `isHexColor` in lib/colors.

**C. Authorization / audit inconsistencies across the sibling features**
- [needless] actions/initiatives.ts:181 `role === 'member'` string compare for "owner or workspace admin"; elsewhere (comments.ts:59, attachments.ts:53, project-templates) permission is `roleAllows(role,'admin')`. Workspace roles bypass the shared rule helper. Fix idea: add `workspaceRoleAllows`.
- [hidden] actions/{epics,customers,epic-labels,epic-relations} call `emitIssueEvent` (epics.ts, customers.ts:3 uses) with `ticketId: null` for non-issue activity; actions/{documents,initiatives,dashboards,project-templates} emit nothing, so webhooks/audit/activity feeds see epics changing but not initiatives or documents. Whether that is a decision or an omission is invisible in code. `emitIssueEvent` is the "issue" event bus used with ticketId null as an escape hatch. Fix idea: rename to a general `emitProjectEvent` and decide per entity; document the omitted ones.
- [hidden] actions/documents.ts:34-45 `authorizeDocument` (archived => no edit, "missing = not yours" masking) vs collab/keys.ts:20-52 `resolveCollabAccess` (`canWrite = roleAllows(role,'write') && !archivedAt`, same masking) — two implementations of "who may edit a doc" against the same tables, one for the markdown snapshot and one for the live CRDT. If doc permissions change (e.g. comment-only docs) both and the route routes/api/collab must follow. Fix idea: `resolveCollabAccess` calls the same document access function.
- [hidden] documents.content is a markdown snapshot (actions/documents.ts:111) while the truth is the Yjs state in collab tables; deleteDocument must remember `deleteCollabQueries(docCollabKey(id))` (:174), and issue deletion must do the same for `issueCollabKey`. Two stores deleted together by convention. Fix idea: one `deleteCollabState(kind,id)` called by the entity delete helpers.

**D. Feature split across files / layers**
- [hidden] "Epic" feature: lib/epics.ts (reads) + actions/{epics,epic-labels,epic-relations}.ts + `availableEpicsForProject`/`AvailableEpic` in issue-service.ts:288 (which epics.ts:42 imports and re-wraps as `getCrossProjectEpicOptions`:431, then actions/epics.ts:276 `listAvailableEpics` wraps again) + setEpicInitiative inside actions/initiatives.ts:206 (writes the `epics` table). Three wrappers for one question and an epics write living in the initiatives file. Fix idea: move `availableEpicsForProject` into epics.ts; move `setEpicInitiative` to actions/epics.ts (or initiative-links).
- [needless] epics.ts is imported by initiatives.ts for `viewerIsMember, selectEpics, toEpicRow, epicProgressQuery`; initiatives.ts:21 and favorites.ts reach into internals of epics.ts (query builders, not an interface). Any change in epic columns breaks initiatives. Fix idea: epics.ts exposes `listVisibleEpics(where)`; initiatives uses that.
- [surplus] actions/comments.ts and actions/attachments.ts: each function is `authorizeProjectAction` + delegate to lib/comments.ts `*As(...)` / lib/attachments.ts (lib twins exist so REST routes reuse them); the `ticketId` non-empty check repeats at comments.ts:24 and attachments.ts:26, and attachments revalidate (41,56) while comments do not. Fix idea: move the id check into the lib function.
- [surplus] palette-commands.ts (48 lines) is a framework-free registry whose only consumer is the 28-line wrapper lib/svelte/palette-commands.svelte.ts (~14 components register through it); its comments still say "useEffect / useSyncExternalStore". Two layers, one real consumer. Fix idea: fold the registry into the svelte file and drop the re-exports (getPaletteCommands/subscribePaletteCommands are used only by the wrapper).
- [hidden] uploads.ts:1 and insights.ts:6 say "NO AUTHORIZATION on writes / callers check membership first" while their reads gate in SQL; a new route that skips `authorizeProjectAction` writes silently. Fix idea: require the authorize result as a parameter.
- [hidden] DAY_MS: pulse.ts (pulse.ts:175-176, insights.ts:199) repeat `cycle-utils.DAY_MS` (cycle-utils.ts:8), plus cron/jobs/pulse.ts:18, widget-data.ts:13, timeline-view.svelte:43, roadmap/timeline.svelte:63 own copies. Fix idea: lib/time.ts `DAY_MS`.
- [hidden] actions/project-templates.ts:43-60 repeats name/description validation of actions/templates.ts and `resolveWorkspace` repeats workspace-access.ts membership. Fix idea: shared validators from B.

## Special-case tally for this area

| category | count | examples |
|---|---|---|
| module-identity branch | 2 | actions/initiatives.ts:181 (`role === 'member'`); collab/keys.ts:25 (`parsed.kind === 'doc'` builds two queries) |
| single-caller param | 2 | actions/attachments.ts:52 `{canAdminister}` and actions/comments.ts:59 `{canModerate}` (one workflow's flag in a shared lib fn) |
| silent catch | 6 | collab/provider.ts:273, :391, :400 (commented), :182, :376, :429 `.catch(() => {})` on send |
| timer-workaround | 0 real | provider.ts:140,328,416,469 are debounce/heartbeat/release timers with comments (RELEASE_DELAY_MS, PUSH_DELAY_MS), not races |
| copied constant | 8 | COLOR_RE x5, DOC_ID/ID x2, DAY_MS x6, isUniqueViolation x10 |

## Nit counts
- actions/epics.ts: 3 (banner comments)
- epics.ts: 3
- actions/customers.ts: 3
- components/epics/epic-model.ts: 4
- customers.ts: 2
- collab/provider.ts: 2
- actions/documents.ts: 1

## Cross-area observations
- Membership EXISTS predicate also lives in tickets.ts:210, views.ts:34, project-access.ts:193, issue-service.ts:250/293, project-data.ts:32: one access predicate belongs in project-access.
- `isUniqueViolation`, `COLOR_RE` and name/trim validators are also copied in actions/{join,invite,labels,workflow-states,project-settings,workspaces}.ts.
- Models-in-components problem repeats for cycle-utils/schedule/issue-defaults (automation.ts, cycles.ts, recurring.ts, actions/{cycles,recurring,planning-settings,drafts,templates}.ts), components/workspaces/{role-rules,slug}.ts and components/oauth/oauth-model.ts.
- issue-service.ts:288 `availableEpicsForProject` belongs to the epics module; routes/api/collab/[key]/+server.ts:56 copies COLOR.
- routes/dashboard/templates/+page.server.ts imports actions/project-templates.ts directly (dep-base violation), bypassing the generated remote.
