# Decision log

Every structural finding in `docs/untangle/inventory/*.md` (paths on the base commit `untangle/base`) is listed here with what the redesign did about it. Status was checked against the code at HEAD.

## Fixes

- **F1 — Domain models live with their domain in `src/lib`, not under `components/` (epic/initiative/document/customer/widget/attachment/cycle/recurring/issue-defaults/workspace slug+types/oauth/editor-issue; one `relativeTime` module)** (commits 1723775, b7afecb)
  - `components/{epics,initiatives,documents,customers,dashboards,issue-hierarchy,cycles,recurring}/*-model.ts`: domain models in the UI tree imported by server (33 dep-base violations) [domain-modules] — fixed (now `src/lib/{epic,initiative,document,customer,widget}-model.ts`, `attachment-utils`, `cycle-utils`, `recurring-schedule`)
  - `components/productivity/issue-defaults.ts:1`: "server-only (imports db)" under components/ [domain-modules] — fixed (`src/lib/issue-defaults.ts`)
  - `document-model.ts:141`: `downloadMarkdown` (DOM/Blob) shares a file with server-imported constants [domain-modules] — fixed (split into `components/documents/download-markdown.ts`)
  - `components/editor/editor-issue.ts:1`: second byte-identical `EditorIssue` [domain-modules] — fixed (single `src/lib/editor-issue.ts`, imported by the editor and the action)
  - `automation.ts:19`, `recurring.ts:23`, `cycles.ts:36`, actions: server imports `cycle-utils` and `issue-defaults` from `components/` [issue-core] — fixed
  - `comments/relative-time.ts` literal copy of `issues/issue-properties.ts` `relativeTime` [issue-ui] — fixed (`lib/relative-time.ts`)

- **F2 — One action result contract and input kit (`server/action-kit`, `db-errors`, `colors`, `project-create`) instead of per-file scaffolding** (commits 7aea52b, ef7af43)
  - `projects.ts:54-100` vs `workspaces.ts:283-340`: project creation pasted twice, `/^[A-Z]{2,6}$/` x3 [auth-tenancy] — fixed (`server/project-create.ts` `createProjectRecord` + key/name validators)
  - `isUniqueViolation` x10, `EMAIL_RE` x3, `Result<T>` x7, `NOT_AUTHENTICATED`/`FORBIDDEN` consts, `parseJson`=`parseStored`, `str`=`text`=`field` [auth-tenancy] — fixed (`db-errors` (also in `issue-service.ts`), `action-kit`, `parseStored` shared from `sso.ts`)
  - `epics.ts:33-35`, `customers.ts:35-37`, `initiatives.ts:31` + 4 more: `Fail`/`fail`/`isFail`/`XActionResult` and name/title validators re-declared per file [domain-modules] — fixed (`action-kit` `ActionResult/fail/isFail/requiredText/optionalText`)
  - `epics.ts:52,59` vs `initiatives.ts:70-95` vs `customers.ts`: "null, string<=max, blank->null" written 3x, initiative reuses `EPIC_DESCRIPTION_MAX` [domain-modules] — partly — shared `optionalText`/`descriptionOrNull`; own `INITIATIVE_DESCRIPTION_MAX`; epics `looseText`/`optionalDate` vs initiatives date kept (messages differ)
  - `isUniqueViolation` copied in 10 action files + `hasPgCode` in issue-service [domain-modules] — fixed (`lib/db-errors.ts` everywhere incl. `issue-service.ts`)
  - `COLOR_RE` copied in epics, epic-labels, labels, workflow-states, collab route [domain-modules] — fixed (`HEX_COLOR_RE`/`isHexColor` in `lib/colors.ts`, `hexColor` in action-kit)
  - `actions/project-templates.ts:43-60` repeats template validation; `resolveWorkspace` repeats workspace membership [domain-modules] — partly — shared validators adopted; `resolveWorkspace` (project-templates.ts:47) still its own lookup
  - `isUniqueViolation` x8, `COLOR_RE`, `validateName/Color/Description` duplicated labels/workflow-states, `Fail` in 12 files [issue-core] — fixed

- **F3 — One explicit refresh marker (`refreshesData`) read by the generator; the Next no-op `revalidatePath`/`revalidateTag` and per-file revalidate helpers go** (commits 7aea52b, ef7af43)
  - `kit/request.ts:54-55` `revalidatePath/Tag` no-ops as regex bait; every action export is an unchecked remote command, authorization is per-function convention [auth-tenancy] — partly — explicit `refreshesData()` marker, regex bait gone; no `withAuth` wrapper, authorization is still a per-function convention
  - `kit/request.ts` (75 importers): Next compat shim; `headers()`/`cookies()` async for no reason; `cache()` swallows `getRequestEvent` failure [auth-tenancy] — partly — dead `cookies`/`permanentRedirect`/`notFound`/`revalidateTag` removed; module still named `request.ts` with async `headers()` and a swallowing `cache()`
  - `revalidatePath('/dashboard/projects/${id}','layout')` hand-written in 34 action lines and 24 UI/route files [domain-modules] — fixed (`refreshesData()`; no `revalidatePath` anywhere in src)
  - `function revalidate…(projectId)` re-declared 22 times with inconsistent scope [issue-core] — fixed (`refreshesData()`, scope fixed to the base refreshing set (154/209 exports identical))
  - `kit/request.ts:15-66` Next shim (dead `cookies`, `permanentRedirect`, `notFound`, `revalidateTag`; `revalidatePath` bait; `cache`, `after`) [routes-platform] — partly — dead exports and bait removed; module not renamed to `request-cache.ts`

- **F4 — One tenant/role rule: `projectMemberOf`, `requireProjectMember`/`getMemberProject`, `workspaceRoleAllows` + role-assignment rules (client-safe), `rolesAllowing`, `authorizeWorkspaceAction`, `checkProjectAccess` for REST+GraphQL** (commits d946f75, e0b2785, 7aea52b, 5c8a01c, 0a3966f, b7afecb, ef7af43)
  - `project-access.ts:4`: "only place" claim; member+role rule copied in project-settings, audit:187-250, presence:27-47, v1 `api.ts:49-66`, graphql `context.ts:42-48,203-216` [auth-tenancy] — partly — audit now uses `getMemberProject`, project-settings/presence/REST use the shared rule; the GraphQL role loader (`graphql/context.ts:44`) still batches its own `projectMembers` query
  - `workspaces.ts:87-102`, `security.ts:112-135`, `sso.ts:618-628`, `audit.ts:219-236`: workspace admin check 4x, `rank` map, `role !== 'member'` x12 [auth-tenancy] — fixed (`authorizeWorkspaceAction` + `workspaceRoleAllows`; `requireWorkspaceAdmin` deleted)
  - `roles.ts:8`, `role-rules.ts:28`, `audit.ts:180`, `workspaces.ts:97,392`: role vocabulary split, `WorkspaceRole` defined twice, actions import policy from `components/` [auth-tenancy] — fixed (`roles.ts` + `workspace-types.ts`; `rolesAllowing` for SQL lists)
  - `v1/_lib/api.ts:49-85` vs `graphql/resolvers.ts:78-93`, `context.ts:196-232`: REST and GraphQL are two implementations; REST imports issue-key from graphql/ [auth-tenancy] — partly — shared `checkProjectAccess`; issue-key moved to `tickets.ts`; the two lookup flows (`projectAccess`/`issueByKey` vs `lookupIssue`) are still separate
  - `epics.ts:64`, `customers.ts:131` `isProjectMember`, `initiatives.ts:51` `isWorkspaceMember`: exact-copy membership probes [domain-modules] — fixed (`getMemberProject` / `getWorkspaceMembership`)
  - 8 copies of the correlated EXISTS membership predicate (`epics`, `customers`, `documents`, `tickets:210`, `dashboards`, `views:34`, `issue-service:293`, `initiatives:32`) [domain-modules] — partly — `projectMemberOf` everywhere; cross-project epic EXISTS now in `epics.ts`; only the workspace variant `initiatives.ts:32 workspaceMember` stays local
  - `initiatives.ts:181` `role === 'member'` string compare vs `roleAllows` elsewhere [domain-modules] — fixed (`workspaceRoleAllows` via `authorizeWorkspaceAction`)
  - `actions/documents.ts:34-45 authorizeDocument` vs `collab/keys.ts:20-52 resolveCollabAccess`: two implementations of "who may edit a doc" [domain-modules] — fixed (`documents.ts getDocumentAccess` used by both)
  - `documents.content` snapshot vs Yjs state; `deleteCollabQueries` must be remembered at delete (documents and issues) [domain-modules] — partly — `collab/store.ts deleteCollabState(kind,id)` used by `deleteDocument`; issue deletion path unchanged
  - `workspace-member-row:42-46`, `workspace-invitation-row:44`, `workspace-invite-dialog:101`: owner/admin role rules re-derived inline [other-ui] — fixed (`workspace-types.ts` (`workspaceRoleAllows`, `canChangeMemberRole`, `inviteRolesFor`) shared with the actions)
  - `epics/epic-updates.svelte:66` mirrors `actions/epics.ts:479` delete-update rule [other-ui] — fixed (`canDeleteUpdate` in `epic-model.ts` used on both sides)

- **F5 — Signed-in guard once in hooks (incl. data requests) and one session path (`getSession` reads locals, `requireUser`/`requireSession`, `loadViewerProject`, `parent()`)** (commits 5c8a01c, b7afecb)
  - `session.ts:7`, `action-auth.ts:28`, `hooks.server.ts:55`, 4 actions: three channels for the current user, 7 raw `auth.api.getSession` [auth-tenancy] — fixed (`getSession` reads `locals`; raw call remains only in hooks (and tests))
  - `hooks.server.ts:63-73`, dashboard layout, 55 page loads: `redirect(303,'/login')` repeated because the hook skipped data requests [auth-tenancy] — fixed (hook guards data requests; `requireUser`/`requireSession`; 0 per-page redirects left)
  - signed-in check three times: `dashboardGuard` (full pages only), dashboard layout, 54 page loads in two spellings [routes-platform] — fixed (hook covers data requests; `requireUser`/`requireSession` in 40 route files; no `redirect(303,'/login')` left)
  - project layout returns `projectData`, then pages re-gate by 3 mechanisms (`getProjectData`, `getMemberProject`, SQL join) [routes-platform] — partly — `loadViewerProject` for settings, `parent()` for triage/cycles/insights/epic/views/issue pages; archive, trash, roadmap, customers, docs, epics list still rely on their SQL membership join
  - 14 settings loads repeat `getMemberProject` → 404 → `{projectId: id, canEdit}`; `projectId: id` x20; role literal away from nav [routes-platform] — partly — `project-load.ts loadViewerProject`; 21 loads still return `projectId: id`, no `settingsLoad(minRole)` wrapper
  - `dashboard/+page.server.ts:15-24` + layout: `projects` loaded twice, impossible `user ? … : [false, []]` branch; same in dashboards/views/my-issues/search [routes-platform] — partly — impossible branch removed; `getProjectsForUser` still re-called in 5 loads (`parent()` would rerun the whole shell load)
  - `insights`, `cycles`, `triage`, `epics/[epicId]` re-fetch `getProjectData` already returned by the layout [routes-platform] — fixed (read through `await parent()`)
  - `cycles/+page.server.ts:18-24` and `triage/…:23-29`: identical `featureOff` return shape built per page [routes-platform] — fixed (`featureOff()` in `project-load.ts`)

- **F6 — Workflow-state and issue rules defined once (closed/open helpers, `workflowStateColumns`, duplicate-state rule, `parseIssueKey`/`resolveIssueKey`, SLA deadline, `issueDocument`, `weekRange`; dead issue-model exports removed)** (commits d946f75, b7afecb)
  - issue key rebuilt in `sla.ts:94`, `actions/notifications.ts:196`; `sla_breached` vs `issue.sla_breached` wording [integrations] — fixed (`formatIssueKey` in `tickets.ts` (sla cron, notifications action, audit, relations); notification/event summaries intentionally differ)
  - `search.ts:78,105` + 12 files: closed-state literals (`isClosed()` plus raw SQL/array copies, `issue-filtering.ts:647 isClosedType`) [issue-core] — fixed (`CLOSED_STATE_TYPES`, `closedStateType()/openStateType()`; no literal left)
  - `actions/sla.ts:88-113`: SLA deadline math 3x; `applySlaPolicyToOpenIssues` writes `tickets` bypassing the issue service [issue-core] — fixed (deadline math in `sla-server.ts`, and the policy write moved there as `applyPolicyToOpenIssues` (still a bulk UPDATE, not routed through issue-service))
  - `search.ts:235`, `similarity.ts:47`: tsvector expression copied, index in a seed migration [issue-core] — partly — `issueDocument` fragment in `tickets.ts`; the index stays in migration 0003
  - `issue-filtering.ts:273` / `search.ts:97` / `graphql/issue-list.ts:34` / `widget-data.ts:44`: one filter language, four evaluators; `weekRange`, `SLA_RISK_MS`, `UNIT_MS` kept equal by hand [issue-core] — partly — `weekRange` in `dates.ts`, shared SLA/time constants, `issue-list` moved to lib; the four evaluators remain (declarative spec skipped)
  - `relations.ts:236-249` private `duplicateState` re-implements `triage.ts:42` [issue-core] — fixed (`relations.ts` uses `duplicateState(await projectStatesQuery(…))`; name-matching magic strings stay)
  - 6-column workflow-state select pasted 13 times [issue-core] — fixed (`workflowStateColumns` + `projectStatesQuery`)
  - `issue-model.ts:81-201`: dead legacy aliases (`IssueAssignee`, `parseIssueFilters`, …, `ISSUE_PATCH_FIELDS`) [issue-core] — fixed (removed; also breaks the only value import cycle)
  - issue key parsing regexes in `graphql/issue-key.ts`, `search.ts:56`, `issues/[key]/+page.server.ts:13`, `editor.ts:21`, `audit.ts:125`; alias resolution twice [issue-core] — partly — `parseIssueKey`/`resolveIssueKey` in `tickets.ts`, `graphql/issue-key.ts` deleted; `audit.ts:127 ISSUE_KEY_RE` kept

- **F7 — Provider-neutral VCS: PR engine halves in `vcs/`, one webhook-url rule, host registry (hooks), one request-noun table, UI provider descriptors** (commits 9014ece, 0a3966f, ef7af43)
  - app base URL has 5 spellings (`app-url.ts:7`, `sso.ts:59`, `github/webhooks.ts:32`, raw `PUBLIC_APP_URL ?? ''` in `invite.ts:38`, `workspace-access.ts:111`, `settings/members`) [auth-tenancy] — partly — invite, workspace invite, members page and GitHub webhook base use `appUrl()`; `sso.ts` `authBaseUrl` kept (prefers BETTER_AUTH_URL, not equivalent)
  - `vcs/automation.ts:28-29`: neutral PR halves live in `github/{references,automation}.ts`, vcs/ imports github/ [integrations] — fixed (`vcs/references.ts`, `vcs/automation-state.ts`)
  - `{id, ticketKey, prOpenStateId, prMergeStateId}` rebuilt in `github/sync.ts:115`, `vcs/integrations.ts:75-81`, GitHub route `projectColumns` [integrations] — fixed (`vcs/project.ts vcsProjectColumns` used by `vcs/integrations.ts` and the GitHub route)
  - `developer.ts:155,205-235,328`: `provider === 'gitlab'` switches with config casts; "can't reach" warning copied in `github.ts:279` [integrations] — fixed (`vcs/hosts.ts` `hookHost` registry; one `unreachableWebhookWarning`)
  - `github/webhooks.ts:29-35` vs `vcs/integrations.ts:98-101`: two webhook base URL rules [integrations] — fixed (`vcs/webhook-url.ts` `webhookBaseUrl()` used by every host)
  - `actions/github.ts:207` builds the branch URL by hand [integrations] — fixed (`branchUrl('github', …)`)
  - `vcs/automation.ts:164` `findIssues(..., branch?)` single-caller param [integrations] — fixed (`findIssues(projectId, numbers, branch: string | null)` — no optional param)
  - `vcs-connect-form`, `vcs-section`: two `VCS_COPY` tables + `provider === 'gitlab'/'bitbucket'` branches; adding a host edits both + `vcs-mark` [other-ui] — partly — `developer/vcs-hosts.ts` descriptors drive both forms; `provider === 'gitlab'` still at `vcs-connect-form.svelte:30,47` and `vcs-mark.svelte:11`
  - `vcs-section.svelte:84-88` inline gitlab/bitbucket mark with hard-coded `#e24329`/`#2684ff`, ignores `VcsMark` [other-ui] — fixed (brand colours in `vcs-hosts.ts` `markColor`, `VcsMark` used)

- **F8 — One secrets/crypto home: `server/crypto` (encrypt/decrypt) + `server/secrets` (safeEqual, hmacHex, verifyHmac, hmacBase64url, appSecret)** (commits 1723775, 9014ece, b7afecb, ef7af43)
  - timing-safe compare written 7 times (`vcs/secrets.ts:33`, `github/webhooks.ts:134`, `intake.ts:33`, `slack/signature.ts:25`, `slack/state.ts:31`, `sso.ts:687`, `cron/daily:19`) [auth-tenancy] — fixed (one `safeEqual` in `server/secrets.ts` (only copy left is its definition))
  - bitbucket route imports `verifySignature` from `github/webhooks`; sentry imports `hmacHex/safeEqual` from `vcs/secrets` [integrations] — fixed (`verifyHmac`/`hmacHex` in `server/secrets`)
  - `vcs/secrets.ts:10-24` vs `slack/installations.ts:23-35` identical encrypt/decrypt; `github-token.ts:44-55` third decrypt [integrations] — fixed (`server/crypto.ts` `encryptToken/decryptToken` (legacy `isEncrypted` guard in github-token kept))
  - timing-safe compare written 6 times in integrations [integrations] — fixed
  - `intake.ts:12`, `slack/state.ts:20`: public dev-secret fallbacks when BETTER_AUTH_SECRET is missing [integrations] — partly — `appSecret(devFallback)` in one place; still falls back instead of throwing in production

- **F9 — One notification entry `createNotifications` with per-type channel rules; event-names registry** (commits 9014ece, b7afecb, ef7af43)
  - `vcs/automation.ts:39-45`: GitLab/Bitbucket PR events named `github.*`; consumers match the literal (`dispatch.ts:39,204`, `types.ts:83`, `audit.ts:77`) [integrations] — partly — consumers use `PR_EVENT` constants; stored `github.*` names and the `'github'` notification type deliberately unchanged
  - five producers insert `notifications` by hand (`dispatch.ts:261`, `sla.ts:126`, `pulse.ts:116`, `recurring.ts:160`, `actions/notifications.ts:241`) [integrations] — fixed (`notifications/create.ts` `createNotifications` + `RULES`; only `create.ts` inserts)
  - `channels/push.ts:28`, `slack-dm.ts:34` re-filter `snoozedUntil`; profile-defaults and actor-name lookups x3 [integrations] — fixed (snooze filtering and actor-name lookup resolved once in `deliverToChannels` (`channels/index.ts`))
  - event-type strings are literals in 10+ places though `ISSUE_EVENT` exists [integrations] — partly — `event-names.ts` registry used by dispatch, slack, event-types, sentry, vcs automation; label maps in `audit.ts`, `timeline.ts`, `activity-summary.ts`, `activity-line.svelte:41` still hold literals

- **F10 — Values both sides must agree on get one definition (time constants, password length, label limits, ids, search marks, presence heartbeat, insights types, initiative limits, HTTP timeouts, Slack constants)** (commits many)
  - project vs workspace invite flows are a copy pair (`invite.ts`/`join.ts` vs `workspaces.ts:401-745`, `workspace-access.ts:106-135`) [auth-tenancy] — partly — TTLs via `DAY_MS`/`WEEK_MS`, absolute links via `appUrl()`; no single invitation module, two email builders and claim flows remain
  - `widget-data.ts:5`: client type-imports `BreakdownRow, WeekPoint` from db-importing `insights.ts` [domain-modules] — fixed (`src/lib/insights-model.ts` holds types and `INSIGHT_RANGES`)
  - id-shape rule: `documents.ts:13 ID`, `:20 DOC_ID`, `customers.ts:45 isId`, `mentions.ts:7`, `collab/codec.ts:15` [domain-modules] — partly — `lib/ids.ts` (`isEntityId`, `isUuid`) used by documents/codec/drafts; `customers.ts:45 isId` (length only) kept
  - `DAY_MS` copies (`cycle-utils.ts:8`, `pulse.ts`, `insights.ts:199`, `cron/jobs/pulse.ts:18`, `widget-data.ts:13`, `timeline-view`, `roadmap/timeline`) [domain-modules] — fixed (`lib/time.ts` `DAY_MS` (single definition))
  - `slack/api.ts:51` hardcoded URL prefix, `oauth.ts:44` `'openid'` beside unused `USER_SCOPES`, `/dashboard/settings/slack` x3 [integrations] — fixed (`SLACK_URL_PREFIX`, `USER_SCOPES`, `SLACK_SETTINGS_PATH`)
  - `slackEscape` lives in the incoming-webhook dispatcher `integrations/slack.ts`; two Slacks share only that [integrations] — partly — moved to `slack/format.ts`; `integrations/slack.ts` not renamed
  - ad hoc HTTP stacks and unnamed timeouts (Slack 3 s, webhooks 5 s, VCS 10 s, Asana 15 s, Shortcut 20 s) [integrations] — partly — `integrations/timeouts.ts` names every timeout; the hand-rolled `fetch` wrappers in slack/api and integrations/slack stay separate
  - cadence copied: `digests.ts:27` vs `pulse.ts:58`, Monday-UTC rule [integrations] — fixed (`cron/cadence.ts` `WEEKLY_MIN_GAP_MS`, `isMondayUtc`)
  - four provider-error mappers; `actions/import.ts:341` Octokit without timeout/UA; repo-name regex x3 [integrations] — partly — import uses `octokitFor` (10 s timeout, UA); error mappers and the three repo regexes (different charsets) kept
  - `actions/planning-settings.ts:42-52,79`: ranges copied from `cycle-utils` (1..8, weekday), "26 weeks" literal, `triageEnabled` saved by planning [issue-core] — partly — validation uses `MIN/MAX_CYCLE_WEEKS`, `WEEKDAYS`; `actions/cycles.ts:38 MAX_DAYS = 26 * 7` literal stays
  - `cycles.ts:138,192` `ensureUpcomingCycles`/`rescheduleUpcomingCycles` take five positional scalars [issue-core] — fixed (`CycleCadence` object passed to `ensureUpcomingCycles`/`rescheduleUpcomingCycles`)
  - `initiative-description.svelte:6`, `create-initiative-dialog.svelte:26` import `EPIC_DESCRIPTION_MAX`; `INITIATIVE_NAME_MAX` copy of `EPIC_NAME_MAX` [other-ui] — fixed (`INITIATIVE_DESCRIPTION_MAX` in `initiative-model.ts`, used by server and UI)
  - `settings/password-form.svelte:10`: `MIN_LENGTH = 8` "keep in sync" with `auth.ts:89` [other-ui] — fixed (`MIN_PASSWORD_LENGTH` in `lib/auth-rules.ts`)

- **F11 — UI contracts named once (issue-dom, picker option builders, bulk-actions, view capabilities, chip class, calendar ids, timeline layout, column width class, `actionErrorText`, shared debounce/storage/focus/cached-loader/clipboard helpers)** (commits f17550f, 0a3966f, 2945565)
  - `issue-context-menu.svelte:125-136` copies `due-date-options` quick options, `PRIORITY_MENU`, viewer-first sort; `start-date-options` third copy [issue-ui] — partly — `option-builders.ts` feeds pickers and context menu; `issue-detail/start-date-options.svelte` keeps its own `quickOptions`
  - `issue-row.svelte:79-83`, `table-view.svelte:130-136`: `refocusRow` per view, none in board/timeline/calendar [issue-ui] — partly — `focusIssueRow` in `issue-dom.ts` shared by row and table; board card, timeline and calendar still have none
  - issue element DOM contract: selector strings across 8 files, calendar chips in some sets only [issue-ui] — partly — `issue-dom.ts` owns typed `rowAttr/boardCardAttr/chipAttr`, `ISSUE_ITEM`, `issueIdOf`, `focusedIssueId`; calendar-chip exclusion intentionally kept
  - rAF/setTimeout(0) "wait for the dialog/popover" focus workarounds, `s` key race in `issue-shortcuts.svelte:157` [issue-ui] — partly — `svelte/focus.ts` `afterFrame`/`afterTask` name the deferrals; no explicit hotkey claim, race kept
  - `use-issue-mutations.svelte.ts:360-690`: `update`/`saveCollabDescription` copies, label string x3, archive/remove skeleton repeated [issue-ui] — fixed (one `sendPatch`/`setLifecycle` path, toasts and undo labels unchanged)
  - `error === 'Forbidden' ? "You don't have permission…"` copied 13x [issue-ui] — fixed (`actionErrorText` in `lib/action-errors.ts`; no `'Forbidden'` literal left in components)
  - `issue-view-host.svelte:52-53` hardcodes `w-[272px]` and 5 columns = `board-layout.ts COLUMN_WIDTH` [issue-ui] — fixed (`COLUMN_WIDTH_CLASS` from `board-layout.ts`)
  - `issues/views.ts:44` `loading` enum + `display-menu.svelte:93,108,230` branch on layout ids [issue-ui] — fixed (`view-capabilities.ts` plus `skeletonColumnClass`/`showsFilteredEmpty` on the view definition; the host no longer imports the board)
  - `issue-context-menu.svelte:50-58 copyText` duplicates `issue-actions.ts copy`; context-menu module-script exports are the shared library [issue-ui] — fixed (`copyToClipboard` in `issue-actions.ts`; helpers in `issues/bulk-actions.ts`)
  - `issues/slots/*` + `issue-detail/slots/*` (36 files): vestigial lane-ownership layer [issue-ui] — fixed (`slots/` flattened in `issues/` and `issue-detail/`; `app-shell/slots` and `project/slots` remain)
  - debounce timers x4 (`issue-filters`, `search-controls`, `use-collab-editor`, `use-draft-autosave`) [issue-ui] — fixed (`svelte/debounce.ts` `createDebouncer`)
  - localStorage try/catch x8 (`display-options`, `new-issue-dialog`, `timeline-view`, `section-similar`) [issue-ui] — fixed (`svelte/storage.ts`)
  - `invite-panel-utils.ts:6` vs `workspaces/workspace-invites.ts:6`: byte-identical `copyText` + `announceSent` [other-ui] — fixed (`components/invite-toasts.ts`)
  - 8 sites re-do `navigator.clipboard.writeText` + try/catch + toast with different wording (epic-list-row, epic-detail, customer-*, documents-list, backup-codes, oauth-app-settings, issue-actions) [other-ui] — partly — `copyToClipboard` in `components/clipboard.ts` and `invite-toasts.ts`; `documents-list`, `backup-codes`, `oauth-app-settings`, `comment-item`, `header-github`, both CopyFields keep their own wording
  - `label-utils.ts` and `workflow-utils.ts` identical 1-line files; 17 inline plurals [other-ui] — fixed (`pluralize` in `lib/format.ts`; `issues-label` wrapper removed)
  - `github/use-github-viewer.svelte.ts:12-27` and `developer/use-vcs-connections.svelte.ts:10-25`: same TTL cache + effect [other-ui] — fixed (`components/use-cached-loader.svelte.ts` `createCachedLoader`/`useLoaded`)
  - 8+ `new Intl.DateTimeFormat` instances with mixed locales [other-ui] — partly — identical formats moved to `lib/format.ts` (`DATE_TIME_MEDIUM_FORMAT`, `MONTH_SHORT_FORMAT`, …); calendar, timeline, when-picker and cycle-utils formats remain local

- **F12 — Pages and routes read through lib, not remote-command action modules; API route helpers in `routes/api/_lib/http.ts`; untrusted-id checks in lib readers** (commits 5c8a01c, ef7af43)
  - per-route copies: `NO_STORE` x4, `sleep` x2, `fail()` x4, JSON body parser x2, sandbox CSP x2, ~10 session 401/404 handlers [auth-tenancy] — fixed (`routes/api/_lib/http.ts` (NO_STORE, abortableSleep, SANDBOX_CSP, fail, readUploadForm, readWebhookBody, `authFailResponse`) + `kit/json-body.ts`)
  - epic feature split: `availableEpicsForProject` in `issue-service.ts:288` wrapped twice; `setEpicInitiative` (writes `epics`) in `initiatives.ts` [domain-modules] — fixed (cross-project epic options and row builders live in `epics.ts`; `availableEpicsForProject` no longer in issue-service)
  - `initiatives.ts:21` and `favorites.ts` reach into `epics.ts` internals (`selectEpics`, `epicProgressQuery`) [domain-modules] — fixed (`epics.ts` exposes `epicRowQueries/epicProgressFor/toEpicRows`; initiatives no longer builds epic queries)
  - `actions/comments.ts:24`, `attachments.ts:26`: authorize + delegate, repeated `ticketId` non-empty check [domain-modules] — fixed (check lives in `readIssueTimeline`/`readAttachments`)
  - `labels.ts`, `workflow-states.ts`: raw Drizzle CRUD in the action layer, dedupe rule only there; API/import/Slack cannot reuse it [issue-core] — fixed (label CRUD and dedupe rule in `lib/labels.ts` (`createLabel`, `labelNameTaken`, shared `ensureLabels` for import); workflow-states stays in its action)
  - 26 route files import `@/lib/db` + drizzle directly [routes-platform] — fixed (27 page loads read through lib `*-read` modules; routes→db edges 36→10, none in page/layout loads (left: 9 `api/**/+server.ts` and `my-issues/queries.server.ts`))
  - `VIEW_COOKIE` read in 3+ loads to pass `defaultView` [routes-platform] — fixed (`readDefaultView(cookies)` next to `VIEW_COOKIE` in `issue-model.ts`)

- **F13 — Child components import sibling `*-types.ts` modules instead of their parent component (17 type-only cycles)** (commits 0a3966f)
  - 17 type-only component import cycles (child imports `Props` from parent `<script module>`) [other-ui] — fixed (sibling `*-types.ts` (e.g. `settings/project-general-types.ts`))

- **F14 — Surplus removed: dead files/exports, kit shim exports, `search-param.ts`, `CookieResponse`, legacy re-exports; density boot script injected from `density.ts`** (commits all)
  - zero-caller exports: `requireProjectOwner`, `requireWorkspaceAdmin`, `permanentRedirect`, `DENSITY_BOOT_SCRIPT/CSS` hand-copied in `app.html` [auth-tenancy] — partly — `requireWorkspaceAdmin`, `permanentRedirect` deleted; `app.html` injects the density script from `density.ts`; `requireProjectOwner` kept (membership tests import it)
  - `palette-commands.ts` registry + 28-line svelte wrapper, React comments [domain-modules] — fixed (registry folded into `svelte/palette-commands.svelte.ts`)
  - `github/sync.ts:21`: `GITHUB_EVENT = PR_EVENT` alias [integrations] — fixed
  - dead exports `getSubscriberIds`, `isSubscribed`, `isNotificationType`, `isSlackEventKind`; `github/sync.ts:244` duplicate `stale` case [integrations] — fixed
  - `triage.ts:21 defaultAcceptState` identical to `defaultNewIssueState`, zero callers [issue-core] — fixed
  - `views/property-chips.ts` barrel imported by nobody; `issue-properties.ts` mixes barrel with `relativeTime` [issue-ui] — fixed (barrel deleted, `relativeTime` in `lib/relative-time.ts`)
  - `coming-soon.svelte` zero importers [other-ui] — fixed
  - `developer/provider-marks.ts` zero importers [other-ui] — fixed
  - `epics/date-label.svelte` zero importers [other-ui] — fixed
  - `ui/scroll-area/*` unused shadcn port [other-ui] — fixed
  - `kit/request.ts:113 CookieResponse` (one importer `slack/oauth.ts`) [routes-platform] — fixed (Slack OAuth sets its nonce via event cookies; shim deleted)
  - Next vocabulary in live code/tests: 79 "Port of" route files, `NEXT_REDIRECT` mocks, `setup.ts` `@next/env` note, `(auth)/search-param.ts` [routes-platform] — partly — `search-param.ts` deleted, setup.ts/vite.config.ts comments swept; `membership.test.ts:18,31` `NEXT_REDIRECT` mock remains

- **F15 — Comment sweep: restating/provenance/lane-tag comments removed; wrong cookie-cache comment fixed** (commits all)
  - `auth.ts:12` says "NO cookie cache" but `:107` enables a 5-minute one [auth-tenancy] — fixed (comment corrected (cookie cache on, 5 min))
  - nit comments: 32 OPTIONS comments, 14 ticket tags in project-access, auth.ts 9, projects.ts 8 "Step N", wrong paths [auth-tenancy] — partly — swept; 8 route files still carry the OPTIONS comment
  - nit comments (epics.ts, customers.ts, epic-model, collab/provider, documents) [domain-modules] — fixed
  - nit comments: section banners, ~25 stale planning IDs, OPTIONS boilerplate in 10 route files [integrations] — fixed
  - nit comments (issue-service 12, issue-filtering, cycles, recurring, search, workflow-states, triage, issue-model, issue-links) [issue-core] — fixed
  - nit comments: "Port of src/components/…tsx" in 130 of 242 files [issue-ui] — partly — stripped in the touched files; a few files still carry them
  - `svelte/theme.svelte.ts:3-13,31` and 147 files carry "Port of …" / next-themes provenance [other-ui] — partly — swept in touched files; a few headers remain (`theme.svelte.ts` mentions next-themes)
  - nit comments: provenance in 147 files; `pending`/`isPending`/`saving` naming [other-ui] — partly — comments swept; naming variance untouched
  - nit comments: 79 "Port of src/app/…" headers, ~20 "layout already authorized" restatements, `setup.ts`, `vite.config.ts` Next comments [routes-platform] — partly — swept in routes, tests and vite.config.ts; 8 `api/v1` route files still carry the OPTIONS comment

## Skipped (owner sign-off or not worth it)

- **Issue property registry across row/table/card/detail** — owner sign-off: large UI redesign, six renderers kept
  - six hand-written renderers/editors per issue property (`issue-row`, `table-view`, `board-card-content`, `issue-detail`, `issue-context-menu`, `bulk-bar`) [issue-ui] — skipped

- **Generic optimistic-list helper (`useRemoteList`)** — owner sign-off: changes offline/undo semantics of detail-section writes
  - optimistic update/rollback written per feature (relations, customers, subscribe, attachments, similar, activity); `resync()` effect in 11 files [issue-ui] — skipped
  - `triage-view.svelte:46-105`: own `handled` set + `running` counter beside `useIssueMutations`; bypasses outbox/undo [issue-ui] — skipped: `triage-view.svelte:56` unchanged

- **Epic/initiative generic components (and neutral folder for the generic pieces in `epics/`)** — owner sign-off: large component fork merge
  - `initiatives/*` vs `epics/*`: name, description, status picker/options/icon are near-identical forks [other-ui] — skipped
  - `epics/` is a 46-file bucket holding generic pieces other folders import [other-ui] — skipped: roadmap and customers still import `components/epics/*`

- **Chart toolkit merge (`charts/` vs `insights/`)** — owner sign-off: touches cycles, dashboards, insights visuals
  - `charts/chart-frame.svelte.ts` vs `insights/chart-kit.svelte.ts`: two chart toolkits (nice axis, hover index, tooltip, table, swatch) [other-ui] — skipped
  - `charts/chart-legend`, `y-axis`, `chart-table`, `swatch`, `chart-frame`: possibly dead leftovers [other-ui] — skipped: decided together with the toolkit merge

- **Settings form shell / `runAction` helper** — owner sign-off: ~50 forms, toast wording would change
  - ~50 `pending`/`saving` declarations, 92 `finally` blocks and ~187 `result.ok` sites rewrite the same pending/toast shape [other-ui] — skipped
  - `settings/action-state.svelte.ts` adopted by only 6 files; two competing patterns [other-ui] — skipped

- **Merging the two UA classifiers / two CopyFields / clipboard texts** — owner sign-off: user-visible wording and classification would change
  - `integrations/copy-field.svelte:30` vs `developer/copy-field.svelte:9`: two `CopyField` components [other-ui] — skipped: both files still present
  - `pwa/push-settings.svelte:67-100 deviceLabel` vs `security/user-agent.ts`: two UA classifiers [other-ui] — skipped: `push-settings.svelte:67` unchanged

- **Removing lazy automation/recurring runs from page loads** — owner sign-off: free-tier hosting relies on them
  - `recurring/+page.server.ts:26`, `+layout.server.ts:27`: GET loads run automations/recurring as "lazy cron"; triple-wrapped catches; stale "no cron on the free tier" [issue-core] — skipped
  - `projects/[id]/+layout.server.ts:27-34` `after(runProjectAutomations)` and `settings/recurring:16-21` lazy run inside GET loads [routes-platform] — skipped

- **GraphQL loader-level authorization** — owner sign-off: security-sensitive redesign of every resolver
  - `graphql/context.ts:5`, `resolvers.ts:277-319`: loaders fetch rows without authorization; `Issue.cycle/project`, `Project.*` trust the parent [auth-tenancy] — skipped

- **CSRF exempt list redesign** — owner sign-off: security-sensitive
  - `hooks.server.ts:22-32` `CSRF_EXEMPT` re-implements the origin check, no test over the list [auth-tenancy] — skipped

- **Per-route OPTIONS (answer once in hooks)** — owner sign-off: changes response behaviour of 30+ routes
  - `routes/api/_lib/options.ts` + 32 `+server.ts`: hand-listed `OPTIONS = allowOptions(...)`, stale "Next answered OPTIONS" comment [auth-tenancy] — skipped: stale comment dropped in most files; 8 route files still carry it

- **Audit workspace events without a project (nullable `workspace_id`)** — owner sign-off: schema migration
  - `audit.ts:5-8,584-607`: workspace-level events stored on the oldest project with JSON scope [auth-tenancy] — skipped

- **Durability of `after()` subscribers / lazy webhook sweep / events bus subscriber registry** — owner sign-off: design change to delivery guarantees
  - `events.ts:26,136`: bus imports `isWebhookDeliverable` and writes `webhookPendingProjectId` into every activity row [integrations] — skipped: subscriber registry not built (`events.ts:28,129` unchanged)
  - durability differs per subscriber (webhooks durable; notifications/Slack/push run once in `after()`) [integrations] — skipped: events.ts header now says they run once
  - retries driven lazily from three places; `deliverWebhooks` sweeps every batch [integrations] — skipped: `outgoing-webhooks.ts:304` unchanged

- **Folder move of chips out of `views/`** — owner sign-off: ~40 import sites, no behaviour gain
  - views/issues/board value-import cycle: `issues/` imports `views/` chips, view-context, use-sortable-groups; registry back-imports [issue-ui] — skipped

- **`NEXT_PUBLIC_*` env fallbacks** — owner sign-off: old env files of self-hosters would stop working
  - `vite.config.ts:27-30` `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY` fallbacks [routes-platform] — skipped

- **Larger redesigns outside this pass (no fix listed)** — not worth it now: needs a design of its own, a migration, or is not a defect
  - `members.ts:185`, `projects.ts`, `workspaces.ts`, `sso.ts:416`: ownership has two sources of truth (`ownerId` and member role) [auth-tenancy] — skipped: derive-one-from-the-other is a data-model change
  - `sso.ts:547-688`, `auth.ts:154-210`, `api-auth.ts:112-129`: hand-copies of Better Auth plugin behaviour, path allow-lists, two sha256 spellings [auth-tenancy] — skipped: needs per-plugin contract tests, not a refactor
  - epic/customer actions emit `emitIssueEvent` with `ticketId: null`; documents/initiatives/dashboards/templates emit nothing (decision or omission invisible) [domain-modules] — skipped: product decision per entity; not documented in code
  - `uploads.ts:1`, `insights.ts:6`: "NO AUTHORIZATION on writes", a new route can skip `authorizeProjectAction` [domain-modules] — skipped: authorize-result parameter not introduced; header comments only
  - `settings-notifications.ts:32` and `actions/notifications.ts:136-171` both upsert `userProfiles`; configurable set spread over 3 places [integrations] — skipped: not in the fix list
  - `sentry/` and `import/` import from `vcs/`; "vcs" is really third-party HTTP + integration rows [integrations] — skipped: rename to `lib/external/` not done
  - `issue-model.ts:12-16`: issue field list in 10 places (IssueRow, IssuePatch, normalizePatch, apply, createIssue x2, toIssueRow, optimistic placeholder, REST, GraphQL) [issue-core] — skipped: one field table is a redesign; only the dead `ISSUE_PATCH_FIELDS` was removed
  - `actions/cycles.ts:103-108`: catch turns every insert failure into "someone created one at the same moment" [issue-core] — skipped: still catch-all at `actions/cycles.ts:96-103`; message unchanged (logged only)
  - `board.svelte:60-95` / `issue-list.svelte:70-110` / `calendar-view` / `timeline-view`: drop-to-patch built per view, dnd-kit#2112 workaround twice [issue-ui] — skipped: `createIssueDnd` not introduced; only calendar drop ids named (F11)
  - `issues-view` -> `issues-view-root` -> `issues-view-body` pass-through layers [issue-ui] — skipped: `issues-view-root.svelte` still imported by `issues-view.svelte:36`
  - `use-issue-mutations.svelte.ts:302-306` options accepts object or getter; `track` flag threaded through six fns [issue-ui] — skipped: getter option kept at `:299-303`
  - project Slack vs account Slack split under one name (`integrations/slack-settings` vs `slack/*`) [other-ui] — skipped: inventory notes it is not a defect
  - `oauth/consent/+page.server.ts:15 toQuery` copies URLSearchParams [routes-platform] — skipped: not a no-op: it regroups interleaved repeated keys (output would differ)
  - swallowed catches in 5 loads with 4 distinct styles [routes-platform] — skipped: all log and degrade; inventory calls them acceptable
  - `people/[userId]/+page.server.ts:25-36` private `ago()` relative-time formatter [routes-platform] — skipped: different thresholds; `ago` still at `+page.server.ts:23`
  - 66 `.svelte` route files hand-write `<svelte:head><title>` [routes-platform] — skipped: 67 still do
  - redirect-only pages (`dashboard/settings`, `projects/[id]/settings`, legacy members URL, views/[viewId], root) [routes-platform] — skipped: still separate routes
  - env var lists copied in `docker-compose.yml`, `selfhost.env.example`, `Dockerfile`, `env.template`; raw `PUBLIC_APP_URL` reads [routes-platform] — skipped: one `env.ts` reader/generation not built
  - `scripts/db-query.mjs` unreferenced dev helper [routes-platform] — skipped: still present; owner's call
  - `vite.config.ts:36` deprecated `alias: { '@': 'src' }` [routes-platform] — skipped: repo convention (`@/`) depends on it
  - `package.json` `test:db` / `test:db:neon`: four knobs for 2 drivers; `skipIf(!localDb)` x7 [routes-platform] — skipped: tests were record-only in this run
  - 7 `local-db` suites skipped by default; `seed-dev.test.ts` is a seeding script [routes-platform] — skipped: tests recorded only, not changed
  - tests `vi.mock('@/lib/kit/request')` coupled to shim export list [routes-platform] — skipped: tests recorded only; mocks unchanged (`routing.test.ts:15`)
  - `routing.test.ts` proves the layout redirects, not that page data requests are protected [routes-platform] — skipped: tests recorded only

## Remaining after round 3

- `issues/views.ts`: `skeletonColumnClass` is a free string, not a union of known classes.
- `board-layout.ts`: the 12px column gap is not named and must match `board-cell` padding by hand.
- `app-shell/slots` and `project/slots` are not flattened (only `issues/` and `issue-detail/` were).
- `initiatives.ts`: `linkedEpicIds` is built twice (lines 97 and 138).
- `project-settings-read.ts` hosts `getAdminProjects`/`getCycleSettings`, which are not project-settings reads.
- `runOutboxAction` (`server/outbox-actions.ts`) has a single caller (`actions/sync.ts`).
- Label rename duplicate check is a caller-first convention (kept for the base error precedence), not enforced by `lib/labels.ts`.
- Single-caller params: tally 23 -> 27.
- Not touched: `actions/cycles.ts:38` `MAX_DAYS`, `customers.ts` `isId`, `initiatives.ts` `workspaceMember`, `audit.ts` `ISSUE_KEY_RE`, `GraphQL` role loader query, `developer/vcs-mark` + `vcs-connect-form` provider branches, `start-date-options` `quickOptions`.

## Status of every inventory finding

### auth-tenancy.md

| # | finding | status |
|---|---|---|
| 1 | `session.ts:7`, `action-auth.ts:28`, `hooks.server.ts:55`, 4 actions: three channels for the current user, 7 raw `auth.api.getSession` | fixed F5: `getSession` reads `locals`; raw call remains only in hooks (and tests) |
| 2 | `project-access.ts:4`: "only place" claim; member+role rule copied in project-settings, audit:187-250, presence:27-47, v1 `api.ts:49-66`, graphql `context.ts:42-48,203-216` | partly F4: audit now uses `getMemberProject`, project-settings/presence/REST use the shared rule; the GraphQL role loader (`graphql/context.ts:44`) still batches its own `projectMembers` query |
| 3 | `workspaces.ts:87-102`, `security.ts:112-135`, `sso.ts:618-628`, `audit.ts:219-236`: workspace admin check 4x, `rank` map, `role !== 'member'` x12 | fixed F4: `authorizeWorkspaceAction` + `workspaceRoleAllows`; `requireWorkspaceAdmin` deleted |
| 4 | `roles.ts:8`, `role-rules.ts:28`, `audit.ts:180`, `workspaces.ts:97,392`: role vocabulary split, `WorkspaceRole` defined twice, actions import policy from `components/` | fixed F4: `roles.ts` + `workspace-types.ts`; `rolesAllowing` for SQL lists |
| 5 | `members.ts:185`, `projects.ts`, `workspaces.ts`, `sso.ts:416`: ownership has two sources of truth (`ownerId` and member role) | skipped: Larger redesigns outside this pass (no fix listed) (derive-one-from-the-other is a data-model change) |
| 6 | `v1/_lib/api.ts:49-85` vs `graphql/resolvers.ts:78-93`, `context.ts:196-232`: REST and GraphQL are two implementations; REST imports issue-key from graphql/ | partly F4, F6: shared `checkProjectAccess`; issue-key moved to `tickets.ts`; the two lookup flows (`projectAccess`/`issueByKey` vs `lookupIssue`) are still separate |
| 7 | `graphql/context.ts:5`, `resolvers.ts:277-319`: loaders fetch rows without authorization; `Issue.cycle/project`, `Project.*` trust the parent | skipped: GraphQL loader-level authorization |
| 8 | `hooks.server.ts:22-32` `CSRF_EXEMPT` re-implements the origin check, no test over the list | skipped: CSRF exempt list redesign |
| 9 | `hooks.server.ts:63-73`, dashboard layout, 55 page loads: `redirect(303,'/login')` repeated because the hook skipped data requests | fixed F5: hook guards data requests; `requireUser`/`requireSession`; 0 per-page redirects left |
| 10 | `routes/api/_lib/options.ts` + 32 `+server.ts`: hand-listed `OPTIONS = allowOptions(...)`, stale "Next answered OPTIONS" comment | skipped: Per-route OPTIONS (answer once in hooks) (stale comment dropped in most files; 8 route files still carry it) |
| 11 | per-route copies: `NO_STORE` x4, `sleep` x2, `fail()` x4, JSON body parser x2, sandbox CSP x2, ~10 session 401/404 handlers | fixed F12: `routes/api/_lib/http.ts` (NO_STORE, abortableSleep, SANDBOX_CSP, fail, readUploadForm, readWebhookBody, `authFailResponse`) + `kit/json-body.ts` |
| 12 | `kit/request.ts:54-55` `revalidatePath/Tag` no-ops as regex bait; every action export is an unchecked remote command, authorization is per-function convention | partly F3: explicit `refreshesData()` marker, regex bait gone; no `withAuth` wrapper, authorization is still a per-function convention |
| 13 | `sso.ts:547-688`, `auth.ts:154-210`, `api-auth.ts:112-129`: hand-copies of Better Auth plugin behaviour, path allow-lists, two sha256 spellings | skipped: Larger redesigns outside this pass (no fix listed) (needs per-plugin contract tests, not a refactor) |
| 14 | `auth.ts:12` says "NO cookie cache" but `:107` enables a 5-minute one | fixed F15: comment corrected (cookie cache on, 5 min) |
| 15 | app base URL has 5 spellings (`app-url.ts:7`, `sso.ts:59`, `github/webhooks.ts:32`, raw `PUBLIC_APP_URL ?? ''` in `invite.ts:38`, `workspace-access.ts:111`, `settings/members`) | partly F7, F10: invite, workspace invite, members page and GitHub webhook base use `appUrl()`; `sso.ts` `authBaseUrl` kept (prefers BETTER_AUTH_URL, not equivalent) |
| 16 | project vs workspace invite flows are a copy pair (`invite.ts`/`join.ts` vs `workspaces.ts:401-745`, `workspace-access.ts:106-135`) | partly F10: TTLs via `DAY_MS`/`WEEK_MS`, absolute links via `appUrl()`; no single invitation module, two email builders and claim flows remain |
| 17 | `projects.ts:54-100` vs `workspaces.ts:283-340`: project creation pasted twice, `/^[A-Z]{2,6}$/` x3 | fixed F2: `server/project-create.ts` `createProjectRecord` + key/name validators |
| 18 | `audit.ts:5-8,584-607`: workspace-level events stored on the oldest project with JSON scope | skipped: Audit workspace events without a project (nullable `workspace_id`) |
| 19 | `kit/request.ts` (75 importers): Next compat shim; `headers()`/`cookies()` async for no reason; `cache()` swallows `getRequestEvent` failure | partly F3, F14: dead `cookies`/`permanentRedirect`/`notFound`/`revalidateTag` removed; module still named `request.ts` with async `headers()` and a swallowing `cache()` |
| 20 | zero-caller exports: `requireProjectOwner`, `requireWorkspaceAdmin`, `permanentRedirect`, `DENSITY_BOOT_SCRIPT/CSS` hand-copied in `app.html` | partly F14: `requireWorkspaceAdmin`, `permanentRedirect` deleted; `app.html` injects the density script from `density.ts`; `requireProjectOwner` kept (membership tests import it) |
| 21 | timing-safe compare written 7 times (`vcs/secrets.ts:33`, `github/webhooks.ts:134`, `intake.ts:33`, `slack/signature.ts:25`, `slack/state.ts:31`, `sso.ts:687`, `cron/daily:19`) | fixed F8: one `safeEqual` in `server/secrets.ts` (only copy left is its definition) |
| 22 | `isUniqueViolation` x10, `EMAIL_RE` x3, `Result<T>` x7, `NOT_AUTHENTICATED`/`FORBIDDEN` consts, `parseJson`=`parseStored`, `str`=`text`=`field` | fixed F2: `db-errors` (also in `issue-service.ts`), `action-kit`, `parseStored` shared from `sso.ts` |
| 23 | nit comments: 32 OPTIONS comments, 14 ticket tags in project-access, auth.ts 9, projects.ts 8 "Step N", wrong paths | partly F15: swept; 8 route files still carry the OPTIONS comment |

### domain-modules.md

| # | finding | status |
|---|---|---|
| 1 | `components/{epics,initiatives,documents,customers,dashboards,issue-hierarchy,cycles,recurring}/*-model.ts`: domain models in the UI tree imported by server (33 dep-base violations) | fixed F1: now `src/lib/{epic,initiative,document,customer,widget}-model.ts`, `attachment-utils`, `cycle-utils`, `recurring-schedule` |
| 2 | `components/productivity/issue-defaults.ts:1`: "server-only (imports db)" under components/ | fixed F1: `src/lib/issue-defaults.ts` |
| 3 | `document-model.ts:141`: `downloadMarkdown` (DOM/Blob) shares a file with server-imported constants | fixed F1: split into `components/documents/download-markdown.ts` |
| 4 | `components/editor/editor-issue.ts:1`: second byte-identical `EditorIssue` | fixed F1, F14: single `src/lib/editor-issue.ts`, imported by the editor and the action |
| 5 | `widget-data.ts:5`: client type-imports `BreakdownRow, WeekPoint` from db-importing `insights.ts` | fixed F10: `src/lib/insights-model.ts` holds types and `INSIGHT_RANGES` |
| 6 | `epics.ts:33-35`, `customers.ts:35-37`, `initiatives.ts:31` + 4 more: `Fail`/`fail`/`isFail`/`XActionResult` and name/title validators re-declared per file | fixed F2: `action-kit` `ActionResult/fail/isFail/requiredText/optionalText` |
| 7 | `epics.ts:52,59` vs `initiatives.ts:70-95` vs `customers.ts`: "null, string<=max, blank->null" written 3x, initiative reuses `EPIC_DESCRIPTION_MAX` | partly F2, F10: shared `optionalText`/`descriptionOrNull`; own `INITIATIVE_DESCRIPTION_MAX`; epics `looseText`/`optionalDate` vs initiatives date kept (messages differ) |
| 8 | `epics.ts:64`, `customers.ts:131` `isProjectMember`, `initiatives.ts:51` `isWorkspaceMember`: exact-copy membership probes | fixed F4: `getMemberProject` / `getWorkspaceMembership` |
| 9 | 8 copies of the correlated EXISTS membership predicate (`epics`, `customers`, `documents`, `tickets:210`, `dashboards`, `views:34`, `issue-service:293`, `initiatives:32`) | partly F4: `projectMemberOf` everywhere; cross-project epic EXISTS now in `epics.ts`; only the workspace variant `initiatives.ts:32 workspaceMember` stays local |
| 10 | id-shape rule: `documents.ts:13 ID`, `:20 DOC_ID`, `customers.ts:45 isId`, `mentions.ts:7`, `collab/codec.ts:15` | partly F10: `lib/ids.ts` (`isEntityId`, `isUuid`) used by documents/codec/drafts; `customers.ts:45 isId` (length only) kept |
| 11 | `revalidatePath('/dashboard/projects/${id}','layout')` hand-written in 34 action lines and 24 UI/route files | fixed F3: `refreshesData()`; no `revalidatePath` anywhere in src |
| 12 | `isUniqueViolation` copied in 10 action files + `hasPgCode` in issue-service | fixed F2: `lib/db-errors.ts` everywhere incl. `issue-service.ts` |
| 13 | `COLOR_RE` copied in epics, epic-labels, labels, workflow-states, collab route | fixed F2: `HEX_COLOR_RE`/`isHexColor` in `lib/colors.ts`, `hexColor` in action-kit |
| 14 | `initiatives.ts:181` `role === 'member'` string compare vs `roleAllows` elsewhere | fixed F4: `workspaceRoleAllows` via `authorizeWorkspaceAction` |
| 15 | epic/customer actions emit `emitIssueEvent` with `ticketId: null`; documents/initiatives/dashboards/templates emit nothing (decision or omission invisible) | skipped: Larger redesigns outside this pass (no fix listed) (product decision per entity; not documented in code) |
| 16 | `actions/documents.ts:34-45 authorizeDocument` vs `collab/keys.ts:20-52 resolveCollabAccess`: two implementations of "who may edit a doc" | fixed F4: `documents.ts getDocumentAccess` used by both |
| 17 | `documents.content` snapshot vs Yjs state; `deleteCollabQueries` must be remembered at delete (documents and issues) | partly F4: `collab/store.ts deleteCollabState(kind,id)` used by `deleteDocument`; issue deletion path unchanged |
| 18 | epic feature split: `availableEpicsForProject` in `issue-service.ts:288` wrapped twice; `setEpicInitiative` (writes `epics`) in `initiatives.ts` | fixed F12: cross-project epic options and row builders live in `epics.ts`; `availableEpicsForProject` no longer in issue-service |
| 19 | `initiatives.ts:21` and `favorites.ts` reach into `epics.ts` internals (`selectEpics`, `epicProgressQuery`) | fixed F12: `epics.ts` exposes `epicRowQueries/epicProgressFor/toEpicRows`; initiatives no longer builds epic queries |
| 20 | `actions/comments.ts:24`, `attachments.ts:26`: authorize + delegate, repeated `ticketId` non-empty check | fixed F12: check lives in `readIssueTimeline`/`readAttachments` |
| 21 | `palette-commands.ts` registry + 28-line svelte wrapper, React comments | fixed F14: registry folded into `svelte/palette-commands.svelte.ts` |
| 22 | `uploads.ts:1`, `insights.ts:6`: "NO AUTHORIZATION on writes", a new route can skip `authorizeProjectAction` | skipped: Larger redesigns outside this pass (no fix listed) (authorize-result parameter not introduced; header comments only) |
| 23 | `DAY_MS` copies (`cycle-utils.ts:8`, `pulse.ts`, `insights.ts:199`, `cron/jobs/pulse.ts:18`, `widget-data.ts:13`, `timeline-view`, `roadmap/timeline`) | fixed F10: `lib/time.ts` `DAY_MS` (single definition) |
| 24 | `actions/project-templates.ts:43-60` repeats template validation; `resolveWorkspace` repeats workspace membership | partly F2: shared validators adopted; `resolveWorkspace` (project-templates.ts:47) still its own lookup |
| 25 | nit comments (epics.ts, customers.ts, epic-model, collab/provider, documents) | fixed F15 |

### integrations.md

| # | finding | status |
|---|---|---|
| 1 | `vcs/automation.ts:28-29`: neutral PR halves live in `github/{references,automation}.ts`, vcs/ imports github/ | fixed F7: `vcs/references.ts`, `vcs/automation-state.ts` |
| 2 | `vcs/automation.ts:39-45`: GitLab/Bitbucket PR events named `github.*`; consumers match the literal (`dispatch.ts:39,204`, `types.ts:83`, `audit.ts:77`) | partly F9: consumers use `PR_EVENT` constants; stored `github.*` names and the `'github'` notification type deliberately unchanged |
| 3 | `github/sync.ts:21`: `GITHUB_EVENT = PR_EVENT` alias | fixed F14 |
| 4 | `{id, ticketKey, prOpenStateId, prMergeStateId}` rebuilt in `github/sync.ts:115`, `vcs/integrations.ts:75-81`, GitHub route `projectColumns` | fixed F7: `vcs/project.ts vcsProjectColumns` used by `vcs/integrations.ts` and the GitHub route |
| 5 | `developer.ts:155,205-235,328`: `provider === 'gitlab'` switches with config casts; "can't reach" warning copied in `github.ts:279` | fixed F7: `vcs/hosts.ts` `hookHost` registry; one `unreachableWebhookWarning` |
| 6 | `github/webhooks.ts:29-35` vs `vcs/integrations.ts:98-101`: two webhook base URL rules | fixed F7: `vcs/webhook-url.ts` `webhookBaseUrl()` used by every host |
| 7 | bitbucket route imports `verifySignature` from `github/webhooks`; sentry imports `hmacHex/safeEqual` from `vcs/secrets` | fixed F8: `verifyHmac`/`hmacHex` in `server/secrets` |
| 8 | `vcs/secrets.ts:10-24` vs `slack/installations.ts:23-35` identical encrypt/decrypt; `github-token.ts:44-55` third decrypt | fixed F8: `server/crypto.ts` `encryptToken/decryptToken` (legacy `isEncrypted` guard in github-token kept) |
| 9 | timing-safe compare written 6 times in integrations | fixed F8 |
| 10 | `intake.ts:12`, `slack/state.ts:20`: public dev-secret fallbacks when BETTER_AUTH_SECRET is missing | partly F8: `appSecret(devFallback)` in one place; still falls back instead of throwing in production |
| 11 | `slack/api.ts:51` hardcoded URL prefix, `oauth.ts:44` `'openid'` beside unused `USER_SCOPES`, `/dashboard/settings/slack` x3 | fixed F10: `SLACK_URL_PREFIX`, `USER_SCOPES`, `SLACK_SETTINGS_PATH` |
| 12 | `slackEscape` lives in the incoming-webhook dispatcher `integrations/slack.ts`; two Slacks share only that | partly F10: moved to `slack/format.ts`; `integrations/slack.ts` not renamed |
| 13 | ad hoc HTTP stacks and unnamed timeouts (Slack 3 s, webhooks 5 s, VCS 10 s, Asana 15 s, Shortcut 20 s) | partly F10: `integrations/timeouts.ts` names every timeout; the hand-rolled `fetch` wrappers in slack/api and integrations/slack stay separate |
| 14 | five producers insert `notifications` by hand (`dispatch.ts:261`, `sla.ts:126`, `pulse.ts:116`, `recurring.ts:160`, `actions/notifications.ts:241`) | fixed F9: `notifications/create.ts` `createNotifications` + `RULES`; only `create.ts` inserts |
| 15 | `channels/push.ts:28`, `slack-dm.ts:34` re-filter `snoozedUntil`; profile-defaults and actor-name lookups x3 | fixed F9: snooze filtering and actor-name lookup resolved once in `deliverToChannels` (`channels/index.ts`) |
| 16 | cadence copied: `digests.ts:27` vs `pulse.ts:58`, Monday-UTC rule | fixed F10: `cron/cadence.ts` `WEEKLY_MIN_GAP_MS`, `isMondayUtc` |
| 17 | `settings-notifications.ts:32` and `actions/notifications.ts:136-171` both upsert `userProfiles`; configurable set spread over 3 places | skipped: Larger redesigns outside this pass (no fix listed) (not in the fix list) |
| 18 | issue key rebuilt in `sla.ts:94`, `actions/notifications.ts:196`; `sla_breached` vs `issue.sla_breached` wording | fixed F6: `formatIssueKey` in `tickets.ts` (sla cron, notifications action, audit, relations); notification/event summaries intentionally differ |
| 19 | event-type strings are literals in 10+ places though `ISSUE_EVENT` exists | partly F9: `event-names.ts` registry used by dispatch, slack, event-types, sentry, vcs automation; label maps in `audit.ts`, `timeline.ts`, `activity-summary.ts`, `activity-line.svelte:41` still hold literals |
| 20 | `events.ts:26,136`: bus imports `isWebhookDeliverable` and writes `webhookPendingProjectId` into every activity row | skipped: Durability of `after()` subscribers / lazy webhook sweep / events bus subscriber registry (subscriber registry not built (`events.ts:28,129` unchanged)) |
| 21 | durability differs per subscriber (webhooks durable; notifications/Slack/push run once in `after()`) | skipped: Durability of `after()` subscribers / lazy webhook sweep / events bus subscriber registry (events.ts header now says they run once) |
| 22 | retries driven lazily from three places; `deliverWebhooks` sweeps every batch | skipped: Durability of `after()` subscribers / lazy webhook sweep / events bus subscriber registry (`outgoing-webhooks.ts:304` unchanged) |
| 23 | four provider-error mappers; `actions/import.ts:341` Octokit without timeout/UA; repo-name regex x3 | partly F10: import uses `octokitFor` (10 s timeout, UA); error mappers and the three repo regexes (different charsets) kept |
| 24 | `actions/github.ts:207` builds the branch URL by hand | fixed F7: `branchUrl('github', …)` |
| 25 | `sentry/` and `import/` import from `vcs/`; "vcs" is really third-party HTTP + integration rows | skipped: Larger redesigns outside this pass (no fix listed) (rename to `lib/external/` not done) |
| 26 | dead exports `getSubscriberIds`, `isSubscribed`, `isNotificationType`, `isSlackEventKind`; `github/sync.ts:244` duplicate `stale` case | fixed F14 |
| 27 | `vcs/automation.ts:164` `findIssues(..., branch?)` single-caller param | fixed F7: `findIssues(projectId, numbers, branch: string / null)` — no optional param |
| 28 | nit comments: section banners, ~25 stale planning IDs, OPTIONS boilerplate in 10 route files | fixed F15 |

### issue-core.md

| # | finding | status |
|---|---|---|
| 1 | `search.ts:78,105` + 12 files: closed-state literals (`isClosed()` plus raw SQL/array copies, `issue-filtering.ts:647 isClosedType`) | fixed F6: `CLOSED_STATE_TYPES`, `closedStateType()/openStateType()`; no literal left |
| 2 | `issue-model.ts:12-16`: issue field list in 10 places (IssueRow, IssuePatch, normalizePatch, apply, createIssue x2, toIssueRow, optimistic placeholder, REST, GraphQL) | skipped: Larger redesigns outside this pass (no fix listed) (one field table is a redesign; only the dead `ISSUE_PATCH_FIELDS` was removed) |
| 3 | `actions/sla.ts:88-113`: SLA deadline math 3x; `applySlaPolicyToOpenIssues` writes `tickets` bypassing the issue service | fixed F6: deadline math in `sla-server.ts`, and the policy write moved there as `applyPolicyToOpenIssues` (still a bulk UPDATE, not routed through issue-service) |
| 4 | `search.ts:235`, `similarity.ts:47`: tsvector expression copied, index in a seed migration | partly F6: `issueDocument` fragment in `tickets.ts`; the index stays in migration 0003 |
| 5 | `issue-filtering.ts:273` / `search.ts:97` / `graphql/issue-list.ts:34` / `widget-data.ts:44`: one filter language, four evaluators; `weekRange`, `SLA_RISK_MS`, `UNIT_MS` kept equal by hand | partly F6: `weekRange` in `dates.ts`, shared SLA/time constants, `issue-list` moved to lib; the four evaluators remain (declarative spec skipped) |
| 6 | `automation.ts:19`, `recurring.ts:23`, `cycles.ts:36`, actions: server imports `cycle-utils` and `issue-defaults` from `components/` | fixed F1 |
| 7 | `actions/planning-settings.ts:42-52,79`: ranges copied from `cycle-utils` (1..8, weekday), "26 weeks" literal, `triageEnabled` saved by planning | partly F10: validation uses `MIN/MAX_CYCLE_WEEKS`, `WEEKDAYS`; `actions/cycles.ts:38 MAX_DAYS = 26 * 7` literal stays |
| 8 | `cycles.ts:138,192` `ensureUpcomingCycles`/`rescheduleUpcomingCycles` take five positional scalars | fixed F10: `CycleCadence` object passed to `ensureUpcomingCycles`/`rescheduleUpcomingCycles` |
| 9 | `function revalidate…(projectId)` re-declared 22 times with inconsistent scope | fixed F3: `refreshesData()`, scope fixed to the base refreshing set (154/209 exports identical) |
| 10 | `isUniqueViolation` x8, `COLOR_RE`, `validateName/Color/Description` duplicated labels/workflow-states, `Fail` in 12 files | fixed F2 |
| 11 | `labels.ts`, `workflow-states.ts`: raw Drizzle CRUD in the action layer, dedupe rule only there; API/import/Slack cannot reuse it | fixed F12: label CRUD and dedupe rule in `lib/labels.ts` (`createLabel`, `labelNameTaken`, shared `ensureLabels` for import); workflow-states stays in its action |
| 12 | `triage.ts:21 defaultAcceptState` identical to `defaultNewIssueState`, zero callers | fixed F14 |
| 13 | `relations.ts:236-249` private `duplicateState` re-implements `triage.ts:42` | fixed F6: `relations.ts` uses `duplicateState(await projectStatesQuery(…))`; name-matching magic strings stay |
| 14 | 6-column workflow-state select pasted 13 times | fixed F6: `workflowStateColumns` + `projectStatesQuery` |
| 15 | `issue-model.ts:81-201`: dead legacy aliases (`IssueAssignee`, `parseIssueFilters`, …, `ISSUE_PATCH_FIELDS`) | fixed F6, F14: removed; also breaks the only value import cycle |
| 16 | issue key parsing regexes in `graphql/issue-key.ts`, `search.ts:56`, `issues/[key]/+page.server.ts:13`, `editor.ts:21`, `audit.ts:125`; alias resolution twice | partly F6: `parseIssueKey`/`resolveIssueKey` in `tickets.ts`, `graphql/issue-key.ts` deleted; `audit.ts:127 ISSUE_KEY_RE` kept |
| 17 | `recurring/+page.server.ts:26`, `+layout.server.ts:27`: GET loads run automations/recurring as "lazy cron"; triple-wrapped catches; stale "no cron on the free tier" | skipped: Removing lazy automation/recurring runs from page loads |
| 18 | `actions/cycles.ts:103-108`: catch turns every insert failure into "someone created one at the same moment" | skipped: Larger redesigns outside this pass (no fix listed) (still catch-all at `actions/cycles.ts:96-103`; message unchanged (logged only)) |
| 19 | nit comments (issue-service 12, issue-filtering, cycles, recurring, search, workflow-states, triage, issue-model, issue-links) | fixed F15 |

### issue-ui.md

| # | finding | status |
|---|---|---|
| 1 | six hand-written renderers/editors per issue property (`issue-row`, `table-view`, `board-card-content`, `issue-detail`, `issue-context-menu`, `bulk-bar`) | skipped: Issue property registry across row/table/card/detail |
| 2 | `issue-context-menu.svelte:125-136` copies `due-date-options` quick options, `PRIORITY_MENU`, viewer-first sort; `start-date-options` third copy | partly F11: `option-builders.ts` feeds pickers and context menu; `issue-detail/start-date-options.svelte` keeps its own `quickOptions` |
| 3 | `issue-row.svelte:79-83`, `table-view.svelte:130-136`: `refocusRow` per view, none in board/timeline/calendar | partly F11: `focusIssueRow` in `issue-dom.ts` shared by row and table; board card, timeline and calendar still have none |
| 4 | issue element DOM contract: selector strings across 8 files, calendar chips in some sets only | partly F11: `issue-dom.ts` owns typed `rowAttr/boardCardAttr/chipAttr`, `ISSUE_ITEM`, `issueIdOf`, `focusedIssueId`; calendar-chip exclusion intentionally kept |
| 5 | rAF/setTimeout(0) "wait for the dialog/popover" focus workarounds, `s` key race in `issue-shortcuts.svelte:157` | partly F11: `svelte/focus.ts` `afterFrame`/`afterTask` name the deferrals; no explicit hotkey claim, race kept |
| 6 | optimistic update/rollback written per feature (relations, customers, subscribe, attachments, similar, activity); `resync()` effect in 11 files | skipped: Generic optimistic-list helper (`useRemoteList`) |
| 7 | `use-issue-mutations.svelte.ts:360-690`: `update`/`saveCollabDescription` copies, label string x3, archive/remove skeleton repeated | fixed F11: one `sendPatch`/`setLifecycle` path, toasts and undo labels unchanged |
| 8 | `triage-view.svelte:46-105`: own `handled` set + `running` counter beside `useIssueMutations`; bypasses outbox/undo | skipped: Generic optimistic-list helper (`useRemoteList`) (`triage-view.svelte:56` unchanged) |
| 9 | `error === 'Forbidden' ? "You don't have permission…"` copied 13x | fixed F11: `actionErrorText` in `lib/action-errors.ts`; no `'Forbidden'` literal left in components |
| 10 | views/issues/board value-import cycle: `issues/` imports `views/` chips, view-context, use-sortable-groups; registry back-imports | skipped: Folder move of chips out of `views/` |
| 11 | `views/property-chips.ts` barrel imported by nobody; `issue-properties.ts` mixes barrel with `relativeTime` | fixed F14, F1: barrel deleted, `relativeTime` in `lib/relative-time.ts` |
| 12 | `issue-view-host.svelte:52-53` hardcodes `w-[272px]` and 5 columns = `board-layout.ts COLUMN_WIDTH` | fixed F11: `COLUMN_WIDTH_CLASS` from `board-layout.ts` |
| 13 | `issues/views.ts:44` `loading` enum + `display-menu.svelte:93,108,230` branch on layout ids | fixed F11: `view-capabilities.ts` plus `skeletonColumnClass`/`showsFilteredEmpty` on the view definition; the host no longer imports the board |
| 14 | `board.svelte:60-95` / `issue-list.svelte:70-110` / `calendar-view` / `timeline-view`: drop-to-patch built per view, dnd-kit#2112 workaround twice | skipped: Larger redesigns outside this pass (no fix listed) (`createIssueDnd` not introduced; only calendar drop ids named (F11)) |
| 15 | `comments/relative-time.ts` literal copy of `issues/issue-properties.ts` `relativeTime` | fixed F1: `lib/relative-time.ts` |
| 16 | `issue-context-menu.svelte:50-58 copyText` duplicates `issue-actions.ts copy`; context-menu module-script exports are the shared library | fixed F11: `copyToClipboard` in `issue-actions.ts`; helpers in `issues/bulk-actions.ts` |
| 17 | `issues-view` -> `issues-view-root` -> `issues-view-body` pass-through layers | skipped: Larger redesigns outside this pass (no fix listed) (`issues-view-root.svelte` still imported by `issues-view.svelte:36`) |
| 18 | `issues/slots/*` + `issue-detail/slots/*` (36 files): vestigial lane-ownership layer | fixed F11: `slots/` flattened in `issues/` and `issue-detail/`; `app-shell/slots` and `project/slots` remain |
| 19 | `use-issue-mutations.svelte.ts:302-306` options accepts object or getter; `track` flag threaded through six fns | skipped: Larger redesigns outside this pass (no fix listed) (getter option kept at `:299-303`) |
| 20 | debounce timers x4 (`issue-filters`, `search-controls`, `use-collab-editor`, `use-draft-autosave`) | fixed F11: `svelte/debounce.ts` `createDebouncer` |
| 21 | localStorage try/catch x8 (`display-options`, `new-issue-dialog`, `timeline-view`, `section-similar`) | fixed F11: `svelte/storage.ts` |
| 22 | nit comments: "Port of src/components/…tsx" in 130 of 242 files | partly F15: stripped in the touched files; a few files still carry them |

### other-ui.md

| # | finding | status |
|---|---|---|
| 1 | `integrations/copy-field.svelte:30` vs `developer/copy-field.svelte:9`: two `CopyField` components | skipped: Merging the two UA classifiers / two CopyFields / clipboard texts (both files still present) |
| 2 | `invite-panel-utils.ts:6` vs `workspaces/workspace-invites.ts:6`: byte-identical `copyText` + `announceSent` | fixed F11: `components/invite-toasts.ts` |
| 3 | 8 sites re-do `navigator.clipboard.writeText` + try/catch + toast with different wording (epic-list-row, epic-detail, customer-*, documents-list, backup-codes, oauth-app-settings, issue-actions) | partly F11: `copyToClipboard` in `components/clipboard.ts` and `invite-toasts.ts`; `documents-list`, `backup-codes`, `oauth-app-settings`, `comment-item`, `header-github`, both CopyFields keep their own wording |
| 4 | `charts/chart-frame.svelte.ts` vs `insights/chart-kit.svelte.ts`: two chart toolkits (nice axis, hover index, tooltip, table, swatch) | skipped: Chart toolkit merge (`charts/` vs `insights/`) |
| 5 | `charts/chart-legend`, `y-axis`, `chart-table`, `swatch`, `chart-frame`: possibly dead leftovers | skipped: Chart toolkit merge (`charts/` vs `insights/`) (decided together with the toolkit merge) |
| 6 | `initiatives/*` vs `epics/*`: name, description, status picker/options/icon are near-identical forks | skipped: Epic/initiative generic components (and neutral folder for the generic pieces in `epics/`) |
| 7 | `initiative-description.svelte:6`, `create-initiative-dialog.svelte:26` import `EPIC_DESCRIPTION_MAX`; `INITIATIVE_NAME_MAX` copy of `EPIC_NAME_MAX` | fixed F10: `INITIATIVE_DESCRIPTION_MAX` in `initiative-model.ts`, used by server and UI |
| 8 | `epics/` is a 46-file bucket holding generic pieces other folders import | skipped: Epic/initiative generic components (and neutral folder for the generic pieces in `epics/`) (roadmap and customers still import `components/epics/*`) |
| 9 | `workspace-member-row:42-46`, `workspace-invitation-row:44`, `workspace-invite-dialog:101`: owner/admin role rules re-derived inline | fixed F4: `workspace-types.ts` (`workspaceRoleAllows`, `canChangeMemberRole`, `inviteRolesFor`) shared with the actions |
| 10 | `epics/epic-updates.svelte:66` mirrors `actions/epics.ts:479` delete-update rule | fixed F4: `canDeleteUpdate` in `epic-model.ts` used on both sides |
| 11 | `settings/password-form.svelte:10`: `MIN_LENGTH = 8` "keep in sync" with `auth.ts:89` | fixed F10: `MIN_PASSWORD_LENGTH` in `lib/auth-rules.ts` |
| 12 | ~50 `pending`/`saving` declarations, 92 `finally` blocks and ~187 `result.ok` sites rewrite the same pending/toast shape | skipped: Settings form shell / `runAction` helper |
| 13 | `settings/action-state.svelte.ts` adopted by only 6 files; two competing patterns | skipped: Settings form shell / `runAction` helper |
| 14 | `label-utils.ts` and `workflow-utils.ts` identical 1-line files; 17 inline plurals | fixed F11: `pluralize` in `lib/format.ts`; `issues-label` wrapper removed |
| 15 | `vcs-connect-form`, `vcs-section`: two `VCS_COPY` tables + `provider === 'gitlab'/'bitbucket'` branches; adding a host edits both + `vcs-mark` | partly F7: `developer/vcs-hosts.ts` descriptors drive both forms; `provider === 'gitlab'` still at `vcs-connect-form.svelte:30,47` and `vcs-mark.svelte:11` |
| 16 | `vcs-section.svelte:84-88` inline gitlab/bitbucket mark with hard-coded `#e24329`/`#2684ff`, ignores `VcsMark` | fixed F7: brand colours in `vcs-hosts.ts` `markColor`, `VcsMark` used |
| 17 | `github/use-github-viewer.svelte.ts:12-27` and `developer/use-vcs-connections.svelte.ts:10-25`: same TTL cache + effect | fixed F11: `components/use-cached-loader.svelte.ts` `createCachedLoader`/`useLoaded` |
| 18 | project Slack vs account Slack split under one name (`integrations/slack-settings` vs `slack/*`) | skipped: Larger redesigns outside this pass (no fix listed) (inventory notes it is not a defect) |
| 19 | `pwa/push-settings.svelte:67-100 deviceLabel` vs `security/user-agent.ts`: two UA classifiers | skipped: Merging the two UA classifiers / two CopyFields / clipboard texts (`push-settings.svelte:67` unchanged) |
| 20 | 8+ `new Intl.DateTimeFormat` instances with mixed locales | partly F11: identical formats moved to `lib/format.ts` (`DATE_TIME_MEDIUM_FORMAT`, `MONTH_SHORT_FORMAT`, …); calendar, timeline, when-picker and cycle-utils formats remain local |
| 21 | `coming-soon.svelte` zero importers | fixed F14 |
| 22 | `developer/provider-marks.ts` zero importers | fixed F14 |
| 23 | `epics/date-label.svelte` zero importers | fixed F14 |
| 24 | `ui/scroll-area/*` unused shadcn port | fixed F14 |
| 25 | 17 type-only component import cycles (child imports `Props` from parent `<script module>`) | fixed F13: sibling `*-types.ts` (e.g. `settings/project-general-types.ts`) |
| 26 | `svelte/theme.svelte.ts:3-13,31` and 147 files carry "Port of …" / next-themes provenance | partly F15: swept in touched files; a few headers remain (`theme.svelte.ts` mentions next-themes) |
| 27 | nit comments: provenance in 147 files; `pending`/`isPending`/`saving` naming | partly F15: comments swept; naming variance untouched |

### routes-platform.md

| # | finding | status |
|---|---|---|
| 1 | signed-in check three times: `dashboardGuard` (full pages only), dashboard layout, 54 page loads in two spellings | fixed F5: hook covers data requests; `requireUser`/`requireSession` in 40 route files; no `redirect(303,'/login')` left |
| 2 | project layout returns `projectData`, then pages re-gate by 3 mechanisms (`getProjectData`, `getMemberProject`, SQL join) | partly F5: `loadViewerProject` for settings, `parent()` for triage/cycles/insights/epic/views/issue pages; archive, trash, roadmap, customers, docs, epics list still rely on their SQL membership join |
| 3 | 14 settings loads repeat `getMemberProject` → 404 → `{projectId: id, canEdit}`; `projectId: id` x20; role literal away from nav | partly F5: `project-load.ts loadViewerProject`; 21 loads still return `projectId: id`, no `settingsLoad(minRole)` wrapper |
| 4 | 26 route files import `@/lib/db` + drizzle directly | fixed F12: 27 page loads read through lib `*-read` modules; routes→db edges 36→10, none in page/layout loads (left: 9 `api/**/+server.ts` and `my-issues/queries.server.ts`) |
| 5 | `kit/request.ts:15-66` Next shim (dead `cookies`, `permanentRedirect`, `notFound`, `revalidateTag`; `revalidatePath` bait; `cache`, `after`) | partly F3, F14: dead exports and bait removed; module not renamed to `request-cache.ts` |
| 6 | `kit/request.ts:113 CookieResponse` (one importer `slack/oauth.ts`) | fixed F14: Slack OAuth sets its nonce via event cookies; shim deleted |
| 7 | `vite.config.ts:27-30` `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY` fallbacks | skipped: `NEXT_PUBLIC_*` env fallbacks |
| 8 | Next vocabulary in live code/tests: 79 "Port of" route files, `NEXT_REDIRECT` mocks, `setup.ts` `@next/env` note, `(auth)/search-param.ts` | partly F14, F15: `search-param.ts` deleted, setup.ts/vite.config.ts comments swept; `membership.test.ts:18,31` `NEXT_REDIRECT` mock remains |
| 9 | `oauth/consent/+page.server.ts:15 toQuery` copies URLSearchParams | skipped: Larger redesigns outside this pass (no fix listed) (not a no-op: it regroups interleaved repeated keys (output would differ)) |
| 10 | `dashboard/+page.server.ts:15-24` + layout: `projects` loaded twice, impossible `user ? … : [false, []]` branch; same in dashboards/views/my-issues/search | partly F5: impossible branch removed; `getProjectsForUser` still re-called in 5 loads (`parent()` would rerun the whole shell load) |
| 11 | `insights`, `cycles`, `triage`, `epics/[epicId]` re-fetch `getProjectData` already returned by the layout | fixed F5: read through `await parent()` |
| 12 | `cycles/+page.server.ts:18-24` and `triage/…:23-29`: identical `featureOff` return shape built per page | fixed F5: `featureOff()` in `project-load.ts` |
| 13 | `projects/[id]/+layout.server.ts:27-34` `after(runProjectAutomations)` and `settings/recurring:16-21` lazy run inside GET loads | skipped: Removing lazy automation/recurring runs from page loads |
| 14 | swallowed catches in 5 loads with 4 distinct styles | skipped: Larger redesigns outside this pass (no fix listed) (all log and degrade; inventory calls them acceptable) |
| 15 | `people/[userId]/+page.server.ts:25-36` private `ago()` relative-time formatter | skipped: Larger redesigns outside this pass (no fix listed) (different thresholds; `ago` still at `+page.server.ts:23`) |
| 16 | 66 `.svelte` route files hand-write `<svelte:head><title>` | skipped: Larger redesigns outside this pass (no fix listed) (67 still do) |
| 17 | `VIEW_COOKIE` read in 3+ loads to pass `defaultView` | fixed F12: `readDefaultView(cookies)` next to `VIEW_COOKIE` in `issue-model.ts` |
| 18 | redirect-only pages (`dashboard/settings`, `projects/[id]/settings`, legacy members URL, views/[viewId], root) | skipped: Larger redesigns outside this pass (no fix listed) (still separate routes) |
| 19 | env var lists copied in `docker-compose.yml`, `selfhost.env.example`, `Dockerfile`, `env.template`; raw `PUBLIC_APP_URL` reads | skipped: Larger redesigns outside this pass (no fix listed) (one `env.ts` reader/generation not built) |
| 20 | `scripts/db-query.mjs` unreferenced dev helper | skipped: Larger redesigns outside this pass (no fix listed) (still present; owner's call) |
| 21 | `vite.config.ts:36` deprecated `alias: { '@': 'src' }` | skipped: Larger redesigns outside this pass (no fix listed) (repo convention (`@/`) depends on it) |
| 22 | `package.json` `test:db` / `test:db:neon`: four knobs for 2 drivers; `skipIf(!localDb)` x7 | skipped: Larger redesigns outside this pass (no fix listed) (tests were record-only in this run) |
| 23 | 7 `local-db` suites skipped by default; `seed-dev.test.ts` is a seeding script | skipped: Larger redesigns outside this pass (no fix listed) (tests recorded only, not changed) |
| 24 | tests `vi.mock('@/lib/kit/request')` coupled to shim export list | skipped: Larger redesigns outside this pass (no fix listed) (tests recorded only; mocks unchanged (`routing.test.ts:15`)) |
| 25 | `routing.test.ts` proves the layout redirects, not that page data requests are protected | skipped: Larger redesigns outside this pass (no fix listed) (tests recorded only) |
| 26 | nit comments: 79 "Port of src/app/…" headers, ~20 "layout already authorized" restatements, `setup.ts`, `vite.config.ts` Next comments | partly F15: swept in routes, tests and vite.config.ts; 8 `api/v1` route files still carry the OPTIONS comment |

