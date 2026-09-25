# Wave A Contracts — exact exported APIs

Everything here exists and typechecks (commit after Wave A). Use these; don't
reinvent them. Detail: `A1-core-contracts.md` and the other `A1-*` / `A2-*` docs.

## Domain — `src/lib/issue-model.ts` (client-safe)
- `StateType`, `STATE_TYPE_ORDER`, `STATE_TYPE_LABEL`, `isStateType`
- `WorkflowState {id,name,type,color,position,description}`
- `Priority`, `PRIORITY_ORDER` (urgent…none), `PRIORITY_LABEL`, `isPriority`
- `IssueUser {id,name,image}` (= `IssueAssignee`), `IssueLabel {id,name,color}`
- `IssueRow` — id, key, number, **projectId**, title, description, stateId, state, priority, estimate, dueDate (`YYYY-MM-DD`), assignee, creator, labels, parentId, sortOrder, cycleId, epicId, milestoneId, githubBranch, startedAt, completedAt, canceledAt, archivedAt, **deletedAt**, createdAt, updatedAt
- `IssuePatch` (absent = untouched, null = clear, `labelIds` = full replacement set), `IssueField`, `ISSUE_PATCH_FIELDS`, `CreateIssueInput = Omit<IssuePatch,'title'> & { title }`
- Filters: see **Filters, grouping & display (B5)** below; `issue-model.ts` re-exports them (legacy aliases `parseIssueFilters` = `filtersFromSearchParams`, `serializeIssueFilters` = `filtersToSearchParams`, `hasActiveFilters` = `isFilterActive`) plus `VIEW_COOKIE`

## Helpers (client-safe)
- `src/lib/workflow.ts`: `DEFAULT_WORKFLOW_STATES`, `sortStates`, `isClosed(type)`, `firstStateOfType(states,type)`, `defaultNewIssueState(states)`, `stateTransitionTimestamps(...)`
- `src/lib/estimates.ts`: `EstimateScale`, `ESTIMATE_SCALES`, `ESTIMATE_SCALE_LABEL`, `isEstimateScale`, `estimateOptions(scale)`, `isValidEstimate`, `formatEstimate`
- `src/lib/dates.ts`: `isDateString`, `toDateString`, `fromDateString`, `addDays`, `dueStatus(date)`, `formatDueDate`
- `src/lib/roles.ts`: `ProjectRole` (owner|admin|member|guest), `AccessLevel` (read|comment|write|admin), `roleAllows(role, level)`
- `src/lib/issue-links.ts`: `issuePath(projectId, key)` → `/dashboard/projects/{id}/issues/{KEY}`, `issueUrl(...)` (browser)
- `src/lib/mentions.ts`: `MENTION_PATTERN`, `formatMention(user)` → `@[Name](user:ID)`, `extractMentionIds`, `newMentionIds(prev,next)`, `stripMentions`
- `src/lib/favorite-targets.ts`: `FAVORITE_TARGETS`, `FavoriteTarget`, `isFavoriteTarget`

## Server — authorization
- `src/lib/action-auth.ts`: `authorizeProjectAction(projectId, level)` → `{ok:true,userId,role} | {ok:false,error:'Not authenticated'|'Forbidden'}`
- `src/lib/project-access.ts`: `requireProjectMember`, `requireProjectOwner`, `getMemberProject`, `ProjectAccessError`
- `src/lib/workspace-access.ts`: `getWorkspaceMembership(slugOrId,userId)`, `requireWorkspaceMember`, `requireWorkspaceAdmin`, `WorkspaceAccessError`, `WorkspaceRole`
- `src/lib/session.ts`: `getSession()` (request-cached)

## Server — reads
- `src/lib/tickets.ts`: `queryIssues(where, {orderBy?,limit?,offset?})` → `IssueRow[]` (**no auth, no archived/deleted filter** — compose with `memberOfIssueProject(userId)` and `activeIssue()`), `assigneeUsers`/`creatorUsers` aliases, `issueQueries` + `mergeIssueRows` (to fold into your own `db.batch`), `toIssueRow`, `getProjectIssues(projectId,userId)` (membership-gated, active only), `getTicketById(projectId,id)`, `getIssueByKey(projectId, number)` (both trust projectId — check membership first)
- `src/lib/project-data.ts`: `getProjectData(projectId,userId)` → `ProjectData | null` (types in `src/lib/project-data-types.ts`: `ProjectData {project: ProjectInfo, states, labels, members: ProjectMember[], cycles: CycleSummary[], epics: EpicSummary[] (+milestones), viewer}`)

## Server — writes
- `src/lib/issue-service.ts` (NO auth, NO revalidate — callers authorize): `IssueActor {userId|null}`, `SYSTEM_ACTOR`, `createIssue(actor, projectId, input)`, `updateIssueFields(actor, projectId, id, patch)`, `bulkUpdate(actor, projectId, ids, patch)`, `archive|unarchive|softDelete|restore(actor, projectId, id)`, `purge(actor, projectId, id)`; results `{ok:true, issue} | {ok:false, error, field?}`. Validates every referenced id; writes activity in the same batch.
- `src/app/actions/tickets.ts` (session-authorized wrappers): `createTicket`, `updateIssue({projectId,id,patch})`, `bulkUpdateIssues`, `archiveIssue`, `unarchiveIssue`, `deleteTicket` (soft), `restoreIssue`, `purgeIssue` (admin)
- `src/app/actions/labels.ts`: `createLabel`, `updateLabel`, `deleteLabel`
- `src/app/actions/favorites.ts`: `toggleFavorite({targetType,targetId})`, `isFavorited(type,id)`
- `src/lib/events.ts`: `ISSUE_EVENT` constants, `IssueEventInput {projectId, ticketId|null, actorId|null, type, data?}`, `StoredIssueEvent`, `IssueChange {field,from,to,added?,removed?}`, `emitIssueEvent(events)` (never throws; fans out via `after()` to `dispatchNotifications`, `postToSlack`, `deliverWebhooks`). **Custom event types: always include `data.summary`** (short past-tense phrase, e.g. "linked PR #12") plus `key`/`title` when about an issue — the activity timeline and notifications render it.
- `src/lib/subscriptions.ts`: `ensureSubscribed(ticketId, userIds)`, `unsubscribe`, `getSubscriberIds`, `getSubscriberIdsByTicket`, `isSubscribed`
- `src/lib/email.ts`: `sendEmail({to,subject,text,html?})` → `Promise<boolean>` (Resend if `RESEND_API_KEY`, else logs)

## Client
- `src/components/project/project-data.tsx`: `ProjectDataProvider`, `useProjectData()` (throws outside provider), `useOptionalProjectData()`, `useProjectPermission(level)`. The project layout (`/dashboard/projects/[id]/**`) provides it for every project route.
- `src/components/issues/use-issue-mutations.ts`: `useIssueMutations(serverIssues, {include?})` → `IssueMutations {issues, create(input, {onSuccess?, onError?}), update(issue,patch), bulkUpdate(issues,patch), archive(issue,onDone?), unarchive(issue,onDone?), remove(issue,onDone?), restore(issue,onDone?)}` — every successful call pushes its inverse on the undo stack (archive ↔ unarchive, remove/restore); `applyIssuePatch`, `patchChangesIssue`, `inversePatch(issue, patch)` (the patch that undoes `patch`), `isPendingIssue`, `isActiveIssue`
- Grouping / display options: see **Filters, grouping & display (B5)** below.
- Pickers `src/components/issue-pickers/*`: `StatePicker`/`StateOptions`, `PriorityPicker`/`PriorityOptions`, `AssigneePicker`/`AssigneeOptions`, `LabelPicker`/`LabelOptions`, `EstimatePicker`/`EstimateOptions`, `DueDatePicker`/`DueDateOptions`, `PickerPopover`, `keywordFilter`, `digitShortcut`, `LABEL_COLORS`
- Glyphs `src/components/ui-icons`: `StatusIcon({type,color?,percent?,size})`, `StateIcon({state,size})`, `PriorityIcon`, `LabelChip` (+`dotColor`), `Avatar`, `EmptyState`, `Skeleton`
- `src/components/issues/issue-properties.tsx`: `LabelChips`, `EstimateChip`, `DueDateChip`, `relativeTime`
- `src/components/issue-detail/property-row.tsx`: `PropertyRow`; `use-draft.ts`: `useDraft`; `IssueDetail({issue, mutations, variant?: 'pane'|'page', onClose?})`
- `IssueRow` / `BoardCard` / `IssueDetail` call `useProjectData()` — cross-project lists need their own row component.
- `src/components/navigation/favorite-button.tsx`: `FavoriteButton({targetType,targetId,initial?})`
- `src/components/coming-soon.tsx`: `ComingSoon({title, description?})`
- Sidebar pieces `src/components/app-shell/sidebar-nav.tsx`: `SidebarSection({title, action?, children})`, `SidebarLink({href,label,icon?,trailing?,exact?,active?,indent?})`
- Registries: `registerHotkeys` (`src/lib/hotkeys.ts` — note: **every** matching handler fires, so guard with `when`; `Hotkey.shift: true` requires Shift and also matches the physical key, e.g. `{mod, shift, key: ','}` = ⌘⇧,; hotkeys without `shift` ignore it, so bare letters that must not fire on Shift guard `when: (e) => !e.shiftKey`; `formatHotkey({mod?, shift?, key})` renders ⌘⇧ / Ctrl+Shift+ and Space), `registerPaletteCommands` (`src/lib/palette-commands.ts`). Existing global keys: ⌘K, `/`, `?`, `c` (create project — B10 retargets inside projects), `g`+`i/m/v/d/s/p`; list: j, k, s, Enter; board: Space, arrows, Esc.

## Slots (host components are frozen; slot files belong to the named agent)
- `src/components/issue-detail/slots/`: `HeaderPresence` (B12), `HeaderFavorite` (B6), `HeaderSubscribe` (B1), `HeaderRemind` (B2), `HeaderGithub` (B3), `MenuExtraItems` (B10), `PropertyParent` (B4), `PropertyCycle` (B7), `PropertyEpic` (B8), `DescriptionEditor` (B1), `SectionSubIssues` / `SectionRelations` / `SectionAttachments` (B4), `SectionPullRequests` (B3), `SectionActivity` (B1) — props `{ issue, mutations }` (see each file).
- `src/components/issues/slots/`: `ToolbarExtra({issues})` (B6), `ListOverlay({issues,onOpen})` (B6), `BulkBar({issues,mutations})` (Wave C), `IssueShortcuts({issues,mutations,selectedIssue})` (B10)
- `src/components/app-shell/slots/`: `InboxBadge({userId})` (B2), `SidebarFavorites({userId})` (B6), `SidebarWorkspaces({userId})` (B9) — rendered by the server `AppShell`; may be async server components.
- `src/components/project/slots/live-updates.tsx`: `LiveUpdates({projectId})` (B12)
- `src/lib/automation.ts`: `runProjectAutomations(projectId)` (B7), called in `after()` by the project layout.
- Dispatchers: `src/lib/notifications/dispatch.ts` (B2), `src/lib/integrations/slack.ts` + `outgoing-webhooks.ts` (B11).

## Routes (stubs render `ComingSoon`; first line names the owner)
Top: `/dashboard/inbox` B2 · `my-issues` B6 · `search` B6 · `views`, `views/[viewId]` B6 · `drafts` B10 · `settings/notifications` B2 · `settings/api-keys` B11 · `workspaces/[slug]` B9 · `workspaces/[slug]/initiatives(/[initiativeId])` B8 · `people/[userId]` B9.
Project `/dashboard/projects/[id]/`: `issues/[key]` B6 · `triage` B7 · `cycles(/[cycleId])` B7 · `epics(/[epicId])` B8 · `roadmap` B8 · `views` B6 · `insights` B12 · `archive`, `trash` B6.
Project settings `…/settings/`: `workflow`, `labels`, `members` B9 · `templates` B10 · `planning`, `automations` B7 · `github` B3 · `integrations`, `intake` B11 · `import-export` B12. (`general` done by A2 — includes estimate scale.)

## Added during Wave B
- `src/components/issue-hierarchy/issue-search-picker.tsx` (B4): `IssueSearchPicker` (popover) / `IssueSearchOptions` (bare list) — props `issues`, `onSelect`, `exclude?`, `value?`, `onClear?`, `clearLabel?`, `placeholder?` + `PickerPopoverProps`. Use it to pick another issue (duplicates, relations, parents).
- `src/components/issue-hierarchy/open-issue.ts` (B4): `useOpenIssue()` — opens an issue in the pane (`?issue=KEY`) or navigates on the permalink page.
- `src/app/actions/relations.ts` (B4): `getIssueRelations`, `addIssueRelation`, `removeIssueRelation`.

## Filters, grouping & display (B5)
- `src/lib/issue-filtering.ts` (client-safe; re-exported from `issue-model.ts`): `IssueFilters {q, stateIds, stateTypes, assigneeIds, creatorIds, priorities, labelIds, cycleIds, epicIds, due: DueFilter[], created: RelativeRange|null, updated: RelativeRange|null, hierarchy: HierarchyFilter[]}`, `IssueFilterInput` (partial + legacy `assignee`), `EMPTY_FILTERS`, sentinels `ME` (viewer, in assignee/creator ids), `NONE` (no label/cycle/epic), `UNASSIGNED`; `normalizeIssueFilters(unknown)`, `filtersFromSearchParams`, `filtersToSearchParams`, `filtersKey`, `isFilterActive`, `FILTER_PARAM_NAMES`, `issueMatcher(input, {viewerId?, allIssues?, today?, now?})`, `matchesFilters`, `filterIssues`; `DUE_FILTERS`, `RELATIVE_RANGES`, `HIERARCHY_FILTERS` (+ `_LABEL` maps).
- `src/components/issues/issue-filters.tsx`: `IssueFiltersProvider({initial?, children})` (URL-seeded, else a saved view's filters; mirrors changes to the URL), `useIssueFilters()`, `useSetIssueFilters()`, `setIssueFilters(next)` (module-level: the mounted view's setter, else the URL), `clearFilters()`, `setSearchParams(changes)` (history.replaceState, no server request), `IssueFilters` (toolbar UI).
- `src/lib/issue-grouping.ts`: `GroupBy` (state|assignee|priority|label|cycle|epic|none), `GROUP_BY_OPTIONS`/`_LABEL`, `OrderBy` (manual|priority|created|updated|dueDate|title), `ORDER_BY_OPTIONS`/`_LABEL`, `IssueGroup {id,label,kind,state?,color?,patch,issues}`, `groupIssues(issues, groupBy, data)`, `subGroupIssues(groups, subGroupBy, data)`, `sortIssues(issues, orderBy)`, `sortOrderBetween(prev, next)`, `patchForMove` / `patchForNestedMove`, `mergePatches`.
- `src/components/issues/display-options.tsx`: `DisplayOptions {layout: ViewLayout, groupBy, subGroupBy, orderBy, showEmptyGroups, showSubIssues, properties: Record<DisplayProperty, boolean>}`, `ViewLayout` (list|board|table|calendar), `VIEW_LAYOUTS`, `isViewLayout`, `DisplayProperty` + `DISPLAY_PROPERTY_LABEL`, `DEFAULT_DISPLAY_OPTIONS`, `normalizeDisplayOptions(unknown)`, `DisplayOptionsProvider({initial?, persist?})` (per-project localStorage unless `initial` is given), `useDisplayOptions()` → `[options, set]` (read-only defaults outside a provider).
- `src/components/views/view-context.tsx`: `useSubIssueCount(issueId)` → `{total, done} | null`, `useSavedView()` → `{id, name, dirty} | null` (inside `IssuesView`).
- `IssuesView` (`src/components/issues/issues-view.tsx`) props: `issues`, `defaultView?`, `createDefaults?: IssuePatch` (cycle / epic pages), `initialFilters?`, `initialDisplay?` (saved view JSON), `savedView?: {id, name}`, `emptyState?`.

## Epics, initiatives & roadmap (B8)
- `src/lib/epics.ts` (server): `getProjectEpics(projectId, userId)` → `{epics: EpicRow[], milestones: MilestoneRow[]}` (archived included; [] for non-members), `getEpicDetail(projectId, epicId, userId)` → `{epic, milestones, updates, issues} | null`.
- `src/lib/initiatives.ts` (server): `getWorkspaceInitiatives(workspaceId, userId)`, `getInitiativeDetail(workspaceId, initiativeId, userId)`, `getInitiativeOptions(workspaceId)`, `getWorkspaceMemberUsers(workspaceId)` (last two: caller checks membership).
- `src/app/actions/epics.ts`: `createEpic`, `updateEpic`, `archiveEpic`, `unarchiveEpic`, `createMilestone`, `updateMilestone`, `deleteMilestone`, `reorderMilestones`, `postEpicUpdate`, `deleteEpicUpdate`. `src/app/actions/initiatives.ts`: `createInitiative`, `updateInitiative`, `deleteInitiative`, `setEpicInitiative`.
- Models: `src/components/epics/epic-model.ts` (`EpicRow`, `MilestoneRow`, `EpicUpdateRow`, `Progress`, `EPIC_STATUSES`, `HEALTHS`, `epicPath(projectId, epicId)`), `src/components/initiatives/initiative-model.ts` (`InitiativeRow`, `InitiativeDetail`, `INITIATIVE_STATUSES`, `initiativesPath(slug, initiativeId?)`).
- `Timeline({items: TimelineItem[], zoom: Zoom, onChangeDates?, className?})` (`src/components/roadmap/timeline.tsx`) — `Zoom` weeks|months|quarters, `ZOOMS`; omit `onChangeDates` for read-only.

## Productivity (B10)
- `src/components/productivity/new-issue-bus.ts`: `requestNewIssue(seed?: NewIssueSeed)` → opened?, `NewIssueSeed {title?, description?, props?: IssuePatch, draftId?}`, `registerNewIssueHost`, `hasIssueCreator`, `subscribeIssueCreator`, `CREATE_PARAM` / `DRAFT_PARAM` / `TEMPLATE_PARAM` (`?create=1`, `?draft=<id>`, `?template=<id>` on issue pages). The `c` key is registered while any host is mounted.
- `NewIssueDialog({open, onOpenChange, defaults?, onCreate, fallback?})` — `fallback` instances only receive requests when the page has no other dialog (IssueShortcuts renders one).
- `src/lib/undo.ts`: `pushUndo(label, run)` → id, `runUndo(id)`, `undoLast()`, `undoToastAction(id)` (sonner `action`), `retainUndoHotkey()` (⌘Z while mounted). `inversePatch` lives in `use-issue-mutations.ts`.
- `PropertyChips({value, onChange, fallbackState?, showDueDate?})` (`src/components/productivity/property-chips.tsx`) — the new-issue / template property row.
- `src/components/productivity/templates-store.ts`: `useTemplates(projectId, enabled?)` → `IssueTemplate[] | undefined` (undefined while loading), `templateProps(template, data)` → `IssuePatch` (drops removed labels / members), `setCachedTemplates`.

## Added during Wave C
- `src/components/issue-hierarchy/attachment-utils.ts`: `MAX_ATTACHMENT_BYTES` is **4 MB** (Vercel Hobby rejects bodies > 4.5 MB); `MAX_ATTACHMENT_LABEL` ("4 MB") for copy.
- `src/app/(auth)/safe-redirect.ts`: `safeRedirect(value)` — `/login` / `/signup` honour `?redirect=` for same-origin `/dashboard…` and `/invite/…` paths only; `authHref(page, redirectTo)`.
- `src/lib/integrations/app-url.ts`: `appUrl()` is the single absolute-origin helper (email templates' `appOrigin` is an alias).
- Root layout provides `TooltipProvider` globally and runs the density boot script in `<head>`; `AppShell` mounts `NavigationCommands`.

### Multi-select, context menu & bulk actions (C1, C4)
- `src/components/issues/selection.tsx`: `IssueSelectionProvider({issues, children})` (prunes ids that leave the visible set; registers `x` / ⌘A), `useIssueSelection()` → `IssueSelection {enabled, subscribe, get, set, toggle, extendTo(id, from), clear, prune}` (no-op store, `enabled: false`, outside a provider), `useSelectedIds()`, `useIsSelected(id)`, `useHasSelection()`, `handleSelectionClick(selection, event, id)` → true when the click was ⌘/Ctrl/Shift selection (skip opening), `SelectCheckbox({checked: boolean | 'mixed', onToggle, label, …})`; also `ISSUE_ITEM`, `VIEW_SCOPE`, `orderedIssueIds(from)`, `isEditableTarget`, `hasOpenLayer`, `preventShiftSelect`.
- Scope: a view's rows live inside a `[data-issue-view]` element; items carry `data-issue-row={id}` (list / table) or `data-board-card={id}`. Ranges, ⌘A and the context menu read ids from the DOM inside that scope (visual order).
- `src/components/issues/issue-context-menu.tsx`: `IssueContextMenu({issues, mutations, children})` (one menu wrapping the view; acts on the selection when the clicked issue is in it), `ConfirmTrashDialog({issues, onOpenChange, onConfirm})` (open while `issues` is non-empty); helpers `applyPatch(mutations, issues, patch)`, `commonValue`, `labelCoverage`, `toggleLabel`, `CoverageMark`, `copyIds`, `copyLinks`.
- `IssuePatch.addLabelIds` / `removeLabelIds`: per-issue label deltas (keep the rest). Can't be combined with `labelIds`; an id can't be in both; not accepted on create (`CreateIssueInput` omits them). Ids must be project labels; `LABELS_MAX` applies to the result; unchanged issues are skipped; the `issue.updated` change is still `{field: 'labelIds', from, to, added, removed}`. Also accepted by `PATCH /api/v1/issues/:key`. `inversePatch` swaps add ↔ remove for the labels each issue actually changed.
- `useIssueMutations` adds `archiveMany(issues, onDone?)` / `removeMany(issues, onDone?)`: one optimistic op, one server call, one undo entry, toast "Archived N issues" / "Moved N issues to trash" (+ Undo). A single issue delegates to `archive` / `remove` (their wording).
- `src/lib/issue-service.ts`: `archiveMany` / `unarchiveMany` / `softDeleteMany` / `restoreMany(actor, projectId, ids)` → `IssuesResult` (≤ `BULK_MAX`, all-or-nothing, one write batch; issues already in the target state are returned untouched). `src/app/actions/tickets.ts`: `archiveIssues` / `unarchiveIssues` / `deleteTickets` / `restoreIssues({projectId, ids})` → `BulkTicketActionResult`.
