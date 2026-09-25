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
- Filters (B5 will extend): `IssueFilters {stateIds, assignee}`, `EMPTY_FILTERS`, `UNASSIGNED`, `VIEW_COOKIE`, `parseIssueFilters`, `serializeIssueFilters`, `hasActiveFilters`, `matchesFilters`, `filterIssues`

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
- `src/components/issues/use-issue-mutations.ts`: `useIssueMutations(serverIssues, {include?})` → `IssueMutations {issues, create(input, {onSuccess?, onError?}), update(issue,patch), bulkUpdate(issues,patch), archive(issue,onDone?), remove(issue,onDone?), restore(issue,onDone?)}`; `applyIssuePatch`, `isPendingIssue`
- `src/lib/issue-grouping.ts`: `GroupBy`, `IssueGroup {id,label,kind,state?,color?,patch,issues}`, `groupIssues(issues, groupBy, data)`
- `src/components/issues/display-options.tsx`: `DisplayOptions`, `OrderBy`, `DisplayProperty`, `DEFAULT_DISPLAY_OPTIONS`, `DisplayOptionsProvider`, `useDisplayOptions()`
- Pickers `src/components/issue-pickers/*`: `StatePicker`/`StateOptions`, `PriorityPicker`/`PriorityOptions`, `AssigneePicker`/`AssigneeOptions`, `LabelPicker`/`LabelOptions`, `EstimatePicker`/`EstimateOptions`, `DueDatePicker`/`DueDateOptions`, `PickerPopover`, `keywordFilter`, `digitShortcut`, `LABEL_COLORS`
- Glyphs `src/components/ui-icons`: `StatusIcon({type,color?,percent?,size})`, `StateIcon({state,size})`, `PriorityIcon`, `LabelChip` (+`dotColor`), `Avatar`, `EmptyState`, `Skeleton`
- `src/components/issues/issue-properties.tsx`: `LabelChips`, `EstimateChip`, `DueDateChip`, `relativeTime`
- `src/components/issue-detail/property-row.tsx`: `PropertyRow`; `use-draft.ts`: `useDraft`; `IssueDetail({issue, mutations, variant?: 'pane'|'page', onClose?})`
- `IssueRow` / `BoardCard` / `IssueDetail` call `useProjectData()` — cross-project lists need their own row component.
- `src/components/navigation/favorite-button.tsx`: `FavoriteButton({targetType,targetId,initial?})`
- `src/components/coming-soon.tsx`: `ComingSoon({title, description?})`
- Sidebar pieces `src/components/app-shell/sidebar-nav.tsx`: `SidebarSection({title, action?, children})`, `SidebarLink({href,label,icon?,trailing?,exact?,active?,indent?})`
- Registries: `registerHotkeys` (`src/lib/hotkeys.ts` — note: **every** matching handler fires, so guard with `when`), `registerPaletteCommands` (`src/lib/palette-commands.ts`). Existing global keys: ⌘K, `/`, `?`, `c` (create project — B10 retargets inside projects), `g`+`i/m/v/d/s/p`; list: j, k, s, Enter; board: Space, arrows, Esc.

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
