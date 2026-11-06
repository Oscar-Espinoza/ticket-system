# Inventory: AUTH, TENANCY, ACCESS, PLATFORM

## Structural findings (max 25, most important first)

**A. "Who is the user" and "may they" are answered in many places, not one**

- [hidden] src/lib/session.ts:7, src/lib/action-auth.ts:28, src/hooks.server.ts:55, server/actions/{projects.ts:37, join.ts:38, project-settings.ts:44, profile.ts:50} — three channels for the current user: `locals.user` (hooks), memoized `getSession()`, and 7 raw `auth.api.getSession` calls. Hooks already resolved the session, so each request pays 2-4 lookups (`authorizeProjectAction` is never memoized; workspaces.ts:217/245 calls it after `getSession`). Changing session handling (cookie cache, impersonation) means touching all. Fix idea: one `currentSession()` that reads `getRequestEvent().locals`; delete the other paths.
- [hidden] src/lib/project-access.ts:4 claims "the ONLY place that reads project_member for authorization", but 34 files select from `projectMembers`. Real copies of the "member + role >= level" rule: server/actions/project-settings.ts:40-62 (own membership query + `need` owner/admin), lib/audit.ts:187-250 (`resolveAuditScope`, own `ADMIN_ROLES` at :180), routes/api/projects/[id]/presence/+server.ts:27-47, v1/_lib/api.ts:49-66 (`projectAccess`), graphql/context.ts:42-48 + :203-216 (`roleIn`, loader). Fix idea: one `projectRole(userId, projectId)` + `can(role, level)` used by actions, REST, GraphQL, audit; adapters only map errors.
- [hidden] Workspace admin check exists 4x with different shapes: server/actions/workspaces.ts:87-102 (`authorizeWorkspace`, private `rank` map), server/actions/security.ts:112-135 (`authorizeWorkspaceAdmin`, re-does id-only guard + fresh user read), lib/sso.ts:618-628 (`canGenerateScimToken`), lib/audit.ts:219-236; workspace-access.ts:64 `requireWorkspaceAdmin` has zero callers. The "ids only, not slugs" guard (workspaces.ts:99, security.ts:118) is repeated by hand. Also `role !== 'member'` as "is admin" appears 12+ times (audit.ts:234, workspaces.ts:243, pages, svelte). Fix idea: `requireWorkspaceRole(workspaceId, userId, min)` beside `roleAllows`; use it everywhere.
- [hidden] Role vocabulary is split: roles.ts:8 `ALLOWED`, components/workspaces/role-rules.ts:28 `ASSIGNABLE`, audit.ts:180 `ADMIN_ROLES`, workspaces.ts:97 `rank`, workspaces.ts:392 `inviteRolesFor` (parallels `assignableRoles`), and `WorkspaceRole` defined twice (workspace-access.ts:13, components/workspaces/workspace-types.ts:5). Server actions import policy from `lib/components/` (a UI folder). Fix idea: move role-rules + workspace roles next to roles.ts; one definition each.
- [hidden] Ownership has two sources of truth: `projects.ownerId` and `project_members.role='owner'` (members.ts:185 updates both in a batch; projects.ts/workspaces.ts:~140/~328 insert both), same for workspaces; sso.ts:416 decides "owner can't be deprovisioned" from `workspaces.ownerId` while every other check uses the member role. Fix idea: derive one from the other, or one `setOwner`.

**B. REST v1 and GraphQL are two implementations of one API**

- [hidden] routes/api/v1/_lib/api.ts:49-85 (`projectAccess`, `issueByKey`, scope via `missingScope` api-auth.ts:60) vs graphql/resolvers.ts:78-93 (`lookupIssue`), graphql/context.ts:196-232 (`requireScope`, `roleIn`, `requireProjectRole`, `visibleIssue`): same flow (credential, scope, role, hide non-members as 404), different error types. v1 imports `resolveIssueKey` from `lib/graphql/issue-key.ts:1` (api.ts:15) — REST depends on a GraphQL folder. Fix idea: shared `lib/api/access.ts` returning typed results; move issue-key out of graphql/.
- [hidden] graphql/context.ts:5 "Loaders fetch raw rows WITHOUT authorization" — every resolver must gate. `Issue.epic` gates (resolvers.ts:314-319) but `Issue.cycle` (:313) and `Issue.project` (:306) trust the parent issue; `Project.states/labels/cycles/members` (:277-285) trust the project. Safe only while the parent was gated. Fix idea: gate inside the loaders (key by viewer+project) so a missed gate cannot leak.

**C. Request-boundary conventions callers must remember**

- [hidden] hooks.server.ts:22-32 `CSRF_EXEMPT` re-implements SvelteKit's origin check because vite.config.ts:48 sets `csrf.trustedOrigins ['*']`. Every new token/signature endpoint needs a regex here or it 403s; every new cookie-authenticated form-POST route is protected only because it isn't listed. `/api/slack/` exempts the whole prefix; no test references the list. Fix idea: per-route opt-out export, or a test over the route list.
- [hidden] hooks.server.ts:63-73 + dashboard/+layout.server.ts + 55 page loads doing `if (!locals.user) redirect(303,'/login')`. The hook skips data requests, hence the repeats. Fix idea: one `requireUser(event)` helper.
- [hidden] routes/api/_lib/options.ts + 32 `+server.ts` files each export `OPTIONS = allowOptions(...)` with a hand-listed method set (+ a stale "Next answered OPTIONS" comment). Adding a verb without updating it silently desyncs `Allow`. Fix idea: answer OPTIONS once in hooks from the route's exports, or delete it.
- [hidden] Per-route copies: `NO_STORE` x4 (changes, stream, presence, collab), `sleep(ms, signal)` x2 (stream:20, collab:82), `fail()` helper x4, JSON body parser x2 (api-auth.ts:158, push/subscriptions:21), sandbox CSP x2 (attachments/[attachmentId]:41, uploads/[uploadId]:27), and ~10 handlers repeating the session 401/404 logic with mixed text/JSON bodies. Fix idea: `routes/api/_lib/` with `requireSessionUser`, `noStore`, `abortableSleep`.
- [special] kit/request.ts:54-55 `revalidatePath/Tag` are no-ops whose only job is to be regex-detected by scripts/gen-remote-actions.mjs (their path args are never read). Every exported function in server/actions becomes an `unchecked` remote command, so authorization is a per-function convention with nothing enforcing it. Fix idea: explicit refresh marker; a `withAuth` wrapper actions must name.

**D. Auth platform glue is welded to plugin internals and env**

- [hidden] sso.ts hand-copies Better Auth plugin behavior: SCIM token format and hash (673-688), SCIM User JSON (730), path allow-lists (`NON_SSO_SIGN_IN_PATHS` :547, `SSO_CALLBACK_PATHS` :580) that duplicate `ctx.path` literals in auth.ts:170-210, and auth.ts:154 `disabledPaths`. Upgrading `@better-auth/sso|scim` can silently break enforcement. Same for api-auth.ts:112-129 ("mirrors the plugin's validation", base64url sha256 inline vs hex `hashApiKey` :25). Fix idea: contract tests per plugin path; one `sha256` util.
- [hidden] auth.ts:12 says "NO cookie cache" but :107 enables a 5-minute one. sso.ts:451/521 and security.ts revokeSession "sign out" by deleting session rows, which the cache keeps alive up to 5 min; security.ts:119 works around it for one read. Fix idea: fix the comment; skip the cache for revoke-sensitive reads or document the window.
- [hidden] App base URL has 5 spellings: integrations/app-url.ts:7 `appUrl()` (PUBLIC_APP_URL, BETTER_AUTH_URL, VERCEL, localhost), sso.ts:59, github/webhooks.ts:32, and raw `PUBLIC_APP_URL ?? ''` in invite.ts:38, workspace-access.ts:111, settings/members/+page.server.ts:20 (yields relative invite links when unset). Fix idea: everything calls `appUrl()`.
- [hidden] Invite flows are a copy pair: project (invite.ts, join.ts) vs workspace (workspaces.ts:401-540, 679-745, workspace-access.ts:106-135): token/url/TTL consts (invite.ts:33-38 vs workspace-access.ts:106-111), email text builders (invite.ts:88, workspaces.ts:491), claim-then-insert-with-rollback. Only the workspace side has a reusable pending-invite lookup; the project one is pasted into join.ts:50-60 and invite/[token]/+page.server.ts:19-46. Fix idea: one invitation module parameterized by scope.
- [hidden] Project creation pasted twice: projects.ts:54-100, workspaces.ts:283-340 (name<=100, `/^[A-Z]{2,6}$/` also at project-settings.ts:115, template check, owner row, 23505 mapping). Fix idea: `createProjectRecord({workspaceId?})`.
- [hidden] audit.ts:5-8, 584-607 stores workspace-level events on the workspace's oldest project with `data.scope='workspace'` JSON (activities.projectId is NOT NULL); a workspace with no project drops events (warn only); readers must know the encoding (:255-290). Fix idea: nullable `workspace_id` on activity.
- [needless] kit/request.ts (75 importers) is a Next compatibility shim: `headers()`/`cookies()` are async for no reason, `cache()` swallows a `getRequestEvent` failure (:48).

**E. Dead and duplicated surplus**

- [surplus] Zero production callers: project-access.ts:143 `requireProjectOwner` (tests only), workspace-access.ts:64 `requireWorkspaceAdmin`, kit/request.ts:61 `permanentRedirect`, density.ts:10/14 `DENSITY_BOOT_SCRIPT`/`DENSITY_CSS` (hand-copied inline in src/app.html:16-17 — a real hidden copy; nothing keeps them equal).
- [surplus] Timing-safe compare written 7 times: vcs/secrets.ts:33, github/webhooks.ts:134, integrations/intake.ts:33, slack/signature.ts:25, slack/state.ts:31, sso.ts:687, routes/api/cron/daily/+server.ts:19. Fix idea: one `safeEqual`.
- [surplus] `isUniqueViolation` x10 (join.ts:28, invite.ts:40, workspaces.ts:62, project-settings.ts:63, labels.ts:65, issue-service.ts:749, inline projects.ts:100, +3); `EMAIL_RE` x3; `Result<T>` types x7; `NOT_AUTHENTICATED`/`FORBIDDEN` consts in 4 action files (30 'Not authenticated' strings); `parseJson` (sso.ts:223) = `parseStored` (security.ts:283); `str` (developer.ts:64) = `text` (security.ts:162) = `field` (profile.ts:24, project-settings.ts:34).

## Special-case tally for this area

| Category | Count | Examples |
|---|---|---|
| module-identity branch | 6 | developer.ts:207, 227, 232 (`provider === 'gitlab'`); sso.ts:378-401 (`via === 'sso'`); auth.ts:170-210 (`ctx.path ===` plugin routes); audit.ts:187 (`kind === 'project'`) |
| single-caller param | 5 | sso.ts:378 `via`; sso.ts:474 `findUser` (one caller, auth.ts:237); selfhost/boot.ts `scheduleDaily(now)` test seam; audit.ts `resolveAuditScope(kind,id)` |
| silent catch | 9 | sso.ts:145 (DNS error = "not proven", locks SSO out on a blip); sso.ts:531 (identity-link cleanup failure only logged); kit/request.ts:48, :79; api-auth.ts:73-76 (`runAfter` falls back to `void task()`); stream/+server.ts:70; profile.ts:31,40 |
| timer / retry workaround | 6 | stream/+server.ts:15 (1.5 s DB poll per open client); collab/[key]:53 (600 ms poll, 20 s long-poll); selfhost/boot.ts:47 (30x2 s DB-wait retry); sso.ts:516 (`> 60_000` age heuristic for "existing account"); sso.ts:155 proof cache TTLs; api-auth.ts:19 `lastUsedAt` throttle |
| copied constant | 11 | `EMAIL_RE` x3; 7-day TTL invite.ts:34 & workspace-access.ts:106; `/^[A-Z]{2,6}$/` x3; sandbox CSP x2; `NO_STORE` x4; density (+app.html); cron hour 8 (boot.ts:87 / vercel.json); `resolveDriver` x2; OAuth scopes x3 (auth.ts:130, oauth-model.ts:8, api-auth.ts:142) |

## Nit counts

Stale Next-era/wrong-path comments or comments restating code (wrong paths: auth.ts:135, boot.ts:1, members.ts:3).
- routes/api/**/+server.ts: 32 files with the identical "Next answered OPTIONS" comment
- lib/project-access.ts: 14 ticket tags (D-xx, WR-xx)
- lib/auth.ts: 9
- server/actions/projects.ts: 8 "Step N:" comments
- routes/invite/workspace/[token]/+page.server.ts: 4
- routes/(auth)/search-param.ts, hooks.server.ts: 3 each; kit/request.ts: 2

## Cross-area observations

- The member/role rule is re-implemented in lib/issue-service.ts, comments.ts, initiatives.ts, dashboards.ts, project-data.ts, slack/asks.ts, cron/jobs/*.ts and server/actions/{epics,move,triage,customers,import,dashboards,initiatives}.ts (all select `projectMembers`/`workspaceMembers` directly).
- The admin rule `role !== 'member'` also lives in ~8 Svelte components (workspace-members, workspace-actions, workspace-projects) and dashboard/workspaces/[slug]/*/+page.server.ts.
- lib/vcs/secrets.ts, github/webhooks.ts, slack/{signature,state}.ts, integrations/intake.ts each own a signature/safeEqual routine; the four webhook routes differ only in header name and compare function.
- scripts/gen-remote-actions.mjs treats `revalidatePath` text as a signal and wraps every action export as an unchecked command, so lib/remote/* and lib/actions/* depend on this area's authorization convention.
