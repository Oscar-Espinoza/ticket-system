# Wave 2 reports



---

## L1 build report

All 53 L1 source files are ported, with no stubs or TODOs. The final `scripts/kit-check.sh` over every L1 target reports 0 errors, and there are no "Cannot find module" errors because the other lanes' targets I import already exist. A repo-wide svelte-check at warning level shows no warnings in my files. I checked types only: nothing has been run in a browser.

## 1. Source → target mapping
Component paths are under `src/lib/components/`.

| Source | Target |
|---|---|
| `app/page.tsx` | `routes/+page.server.ts` (redirect 303 to `/dashboard`) + `routes/+page.svelte` (empty) |
| `app/layout.tsx` | `routes/+layout.svelte`: `<RegisterServiceWorker/>` and `<OfflineBanner/>` at W1c's marked spot, plus their 2 imports |
| `app/offline/page.tsx`, `retry-button.tsx` | `routes/offline/+page.svelte`, `+page.ts` (`prerender = true`, replacing force-static), `retry-button.svelte` |
| `app/dashboard/layout.tsx` | `routes/dashboard/+layout.server.ts` (session guard + shell data) + `+layout.svelte` |
| `app/dashboard/page.tsx` | `routes/dashboard/+page.server.ts` + `+page.svelte` (title "Projects") |
| `app/dashboard/error.tsx` | `routes/dashboard/+error.svelte` |
| `app/dashboard/loading.tsx`, `projects/[id]/loading.tsx` | `app-shell/dashboard-loading.svelte`, `app-shell/project-loading.svelte`, shown by `app-shell/navigation-loading.svelte.ts`; progress bar `app-shell/navigation-progress.svelte` |
| `app/dashboard/projects/not-found.tsx` | `routes/dashboard/projects/+error.svelte` |
| `app/dashboard/projects/[id]/layout.tsx` | `routes/dashboard/projects/[id]/+layout.server.ts` + `+layout.svelte` |
| `app/dashboard/projects/[id]/not-found.tsx` | `routes/dashboard/projects/[id]/+error.svelte` |
| `app/dashboard/settings/layout.tsx`, `projects/[id]/settings/layout.tsx` | `routes/dashboard/settings/+layout.svelte`, `routes/dashboard/projects/[id]/settings/+layout.svelte` |
| `app-shell/app-shell.tsx` | `app-shell/app-shell.svelte` + `app-shell/app-shell.server.ts` (`loadAppShellData`) |
| `app-shell/breadcrumb.tsx`, `shell-frame.tsx` | `breadcrumb.svelte`, `shell-frame.svelte` |
| `app-shell/settings-nav.tsx` | `settings-nav.svelte` (SettingsNav), `settings-frame.svelte` (SettingsFrame) |
| `app-shell/sidebar-nav.tsx` | `sidebar-nav.ts` (barrel), `sidebar-row.ts`, `sidebar-link.svelte`, `sidebar-section.svelte` |
| `app-shell/sidebar-projects.tsx` | `sidebar-projects.svelte` + `sidebar-project-item.svelte` (recursive) |
| `app-shell/slots/*` | `app-shell/slots/inbox-badge.svelte`, `sidebar-favorites.svelte`, `sidebar-workspaces.svelte` |
| `project-list.tsx` | `project-list.svelte` + `project-list.server.ts` (`getProjectsForUser`, `UserProject`) |
| `navigation/*.tsx` (15 files) | `navigation/<same>.svelte`; `list-navigation.svelte` default export = NavList; view-list also gets local `edit-view-dialog.svelte` and `delete-view-dialog.svelte` |
| `project/project-tabs.tsx` | `project/project-tabs.svelte` |
| `project/slots/live-updates.tsx` | `project/slots/live-updates.svelte` + `live-updates.svelte.ts` (presence store) |
| `pwa/*`, `sync/sync-status.tsx` | `pwa/offline-banner.svelte`, `push-settings.svelte`, `register-sw.svelte`, `sync/sync-status.svelte` |
| `command-palette.tsx`, `topbar-chrome.tsx`, `user-menu.tsx`, `hotkey-overlay.tsx`, `create-project-dialog.tsx`, `wordmark.tsx`, `coming-soon.tsx`, `dashboard-greeting.tsx` | the same names as `.svelte` |

## 2. API decisions other lanes must know
- **Project layout data:** `data.projectData` holds the full `getProjectData()` result. Components get it through the `useProjectData()` context. The project layout re-mounts per project (`{#key project.id}`), as Next did.
- **Dashboard layout data:** `data.user {id,email,name,image}`, `data.projects` (shell fields), `data.favorites`, `data.workspaces`, and `data.inboxCount` (a streamed promise).
- **Server-only imports:** `getProjectsForUser` and type `UserProject` come from `@/lib/components/project-list.server`. `<ProjectList projects>` takes the rows as a prop.
- **Sidebar helpers:** `@/lib/components/app-shell/sidebar-nav` exports `sidebarRowClass`, `isActivePath`, `SidebarLink` and `SidebarSection`.
  - `SidebarLink` props: `href, label, icon?: Snippet, trailing?: Snippet, exact, active, indent`.
  - `SidebarSection` props: `title: string | Snippet, action?: Snippet, children`.
- **Settings frame:** `<SettingsFrame>{#snippet nav()}…{/snippet}…</SettingsFrame>`.
- **Shell slots:** `AppShell` and `ShellFrame` take `topbarRight`, `sidebarFooter`, `inboxBadge`, `favorites` and `workspaces` as snippets. `InboxBadge` takes `count: Promise<number> | number`, not `userId`. `SidebarFavorites` takes `items`; `SidebarWorkspaces` takes `workspaces`.
- **Nav row:** `NavIssueRow` takes `title`, `below` and `actions` as Snippets; pass `actions` only when the React code rendered them.
- **View list:** `import ViewList, { viewHref, type ViewListItem } from '@/lib/components/navigation/view-list.svelte'`. PushSettings exports `type PushDevice` from its module script.
- **Presence:** `useProjectPresence(projectId | () => id, ticketId | () => id | null)` returns `{ readonly current }`. Import it from `…/project/slots/live-updates.svelte.ts`, with the extension. L4's header-presence already does.
- **Navigation loading:** `useNavigationLoading()` returns `{active, dashboard, project}`. Nobody else needs to render a loading state.

## 3. Not ported 1:1, and why
- **loading.tsx:** the lane note turns these into one progress bar (shown after 150 ms) plus my two skeletons.
  - The skeletons appear only where Next would have shown those two loading files, and not for same-path navigations.
  - Routes that had their own loading.tsx (inbox, cycles, triage, members, workflow, workspace, person, all owned by other lanes) now show only the bar.
  - Content stays mounted but hidden while a skeleton shows.
- **Errors:**
  - Non-404 errors from project pages render inside the project layout. Next replaced the whole project frame with the dashboard error view.
  - A 404 in other dashboard pages shows Next's built-in "404 | This page could not be found." text inside the shell, because SvelteKit can't leave the layout.
  - "Try again" calls `goto(page.url, {refreshAll:true, replace:true, reset:false})`.
- **CreateProjectDialog** clears the name field after every submit. This copies React 19's automatic reset of a `<form action>`; the ticket key and template keep their values.
- **Refresh after actions:** I dropped the explicit `router.refresh()` after `updateView` and `deleteView`, because those wrappers already refresh. LiveUpdates and PushSettings call `refreshAfterWrite()`.
- **TopbarChrome** no longer renders a `<Toaster>`; the root layout has the only one.
- **Smaller changes:**
  - The dashboard layout sends only `id, email, name, image` of the user to the client, not the whole session user.
  - SearchControls uses `goto(…, {replace:true, reset:false})` so typing keeps focus.
  - `NODE_ENV` checks are now `dev` from `$app/env`.

## 4. Cross-lane imports (all exist and type-check)
| Lane | Import | Props / usage |
|---|---|---|
| L7 | `inbox/inbox-badge-count.svelte` | `{initial}` |
| L7 | `inbox/switch-row.svelte` | `{id,label,description,checked,onChange}` |
| L9a | `workspaces/create-workspace-trigger.svelte` | `{variant}` |
| L8 | `project-templates/template-select.svelte` | `{id,templates,value,onChange}` |
| L8 | `useProjectTemplates(() => open)` from `template-select.svelte.ts` | returns `.current` |
| L5 | `editor/markdown.svelte` | `{source, embeds}`; L5 renamed React's `children` to `source` |
| L3a | `issues/label-chips.svelte`, `issues/due-date-chip.svelte` | — |
| L3a | `relativeTime` from `issues/issue-properties` | — |
| L3a | `issues/issues-view.svelte`, `issues/slots/issue-shortcuts.svelte` | — |
| L4 | `issue-detail/issue-detail.svelte` | `{issue, mutations, variant}` |
| L3b | `views/search-syntax-help.svelte`, `views/search-term-chips.svelte` | — |

SearchControls has its own 3-line `appendToken`, as W1c's IssueFilters does.

## 5. Coordinator to-dos
1. **`productivity/new-issue-bus.ts`:** TopbarChrome imports it as-is from `@/components/productivity/new-issue-bus`, as L7's notes say, so it shares the host registry. That module registers its `c` hotkey through the React `@/lib/hotkeys` registry. The result is a second keydown listener that uses the Radix layer test, and `c` doesn't appear in the `?` overlay. A Svelte copy should replace it for both lanes.
2. **`public/sw.js` is still Next-shaped:** it caches `/_next/static/*` (SvelteKit uses `/_app/immutable/*`) and doesn't know about `__data.json` requests from client navigation. Offline client navigation probably needs that handling. I didn't edit it, since lane rules say it stays.
3. **Prerendered `/offline`:** the page is prerendered, which runs `hooks.server.ts` at build time (it skips the session while `building`). If that causes build problems, drop `routes/offline/+page.ts`; SSR serves the page fine.
4. **Dashboard guard on client navigation:** as in Next, the dashboard layout load doesn't re-run its guard on client navigations between pages. Each page load still has to check auth. A `/dashboard` guard in `hooks.server.ts` would add a second line of defence; that's your call.
5. **Root layout edit:** I edited the import block of `src/routes/+layout.svelte` (2 imports) as well as the marked spot.

## 6. Last kit-check
```
kit-check: 0 error(s) in src/lib/components/app-shell src/lib/components/navigation src/lib/components/command-palette src/lib/components/project/project-tabs.svelte src/lib/components/project/slots src/lib/components/pwa src/lib/components/sync src/lib/components/topbar-chrome.svelte src/lib/components/user-menu.svelte src/lib/components/hotkey-overlay.svelte src/lib/components/project-list src/lib/components/create-project-dialog.svelte src/lib/components/wordmark.svelte src/lib/components/coming-soon.svelte src/lib/components/dashboard-greeting.svelte src/routes/+page src/routes/+layout.svelte src/routes/offline src/routes/dashboard/+ src/routes/dashboard/projects/+error.svelte src/routes/dashboard/projects/\[id\]/\+ src/routes/dashboard/projects/\[id\]/settings/\+layout src/routes/dashboard/settings/+layout
```


### L1 review

- [major] src/lib/components/app-shell/navigation-loading.svelte.ts: boundaryFor() (lines 36-47) shows a skeleton for any navigation to a different pathname under /dashboard, and for any change of path inside the same project. Next showed a loading.tsx fallback only when the route segment directly under the layout that owns the loading.tsx changed. Next keys each boundary by that child segment, and a navigation runs as a transition, so a boundary that is already showing content keeps the old UI. The port therefore shows skeletons where Next showed none, and hides the real content behind them after 150 ms: (1) /dashboard/settings/profile -> /dashboard/settings/appearance: the 'settings' segment under dashboard is the same, but the dashboard-home skeleton replaces the whole SettingsFrame, nav included. (2) /dashboard/projects/A/settings/general -> .../settings/labels: the 'settings' segment under [id] is the same, but the issues skeleton replaces the project settings frame. (3) Issue permalink to issue permalink (/issues/APP-1 -> /issues/APP-2): the issues skeleton hides the current issue. (4) /dashboard/views/1 -> /views/2, and project A -> project B (both keep 'views' or 'projects' as the segment under dashboard): Next kept the old page visible, the port shows the dashboard skeleton. The report's claim that 'the skeletons appear only where Next would have shown those two loading files' is therefore wrong. This breaks parity on very common navigations. → Compare the first segment below each boundary owner, not the whole pathname. Dashboard boundary: show it only when the segment after 'dashboard' changes. Compare it by route-id segment, and for a dynamic segment by its value; the dashboard page itself counts as the empty segment. So /dashboard/projects/A -> /dashboard/projects/B (segment 'projects' in both) shows nothing. Project boundary: when from and to share params.id, show it only when the segment after projects/[id] changes ('', 'issues', 'settings', 'cycles', …). Same-path and search-param-only navigations stay null. Keep the OWN_LOADING exclusion.
- [minor] src/lib/components/app-shell/slots/inbox-badge.svelte: Line 22: `{#await count then initial}` has no pending branch. refreshAfterWrite()/refreshAll() re-runs the dashboard layout load after every write (issue edits, favorites, views…). Each re-run returns a new streamed `inboxCount` promise, so the await block switches back to pending: the sidebar Inbox badge disappears and InboxBadgeCount remounts until the new chunk arrives. In React, router.refresh() ran as a transition, which kept the already-revealed Suspense content, so the badge never blinked. → Keep the last resolved value and show it while a new promise is pending. For example, hold `let last = $state<number|null>(null)`, set it in an $effect when the promise resolves (or with `{#await count}{#if last !== null}<InboxBadgeCount initial={last}/>{/if}{:then v}…`). Better, render one InboxBadgeCount whose `initial` updates, so it isn't remounted on every refresh.
- [minor] src/components/productivity/new-issue-bus.ts: TopbarChrome (src/lib/components/topbar-chrome.svelte:41-45) imports the React-registry bus as is. Inside a project with a NewIssueDialog host, the topbar's own `c` is unregistered (line 178), and `c` is then served by `@/lib/hotkeys` (the React registry). That adds a second window keydown listener that uses the Radix layer test instead of bits-ui's, and 'Create issue' (c) disappears from the `?` HotkeyOverlay, which reads only the Svelte registry. This is a parity gap in L1's overlay and shortcuts; the builder and W1c already reported it. → Coordinator/L7: add a Svelte copy of new-issue-bus (for example src/lib/components/productivity/new-issue-bus.svelte.ts) that registers through @/lib/svelte/hotkeys.svelte. Point TopbarChrome and L7's NewIssueDialog/IssueShortcuts at it, so both use the same host list.
- [minor] public/sw.js: Lines 133-144: the worker caches only `/_next/static/*` (cache-first) and skips Next RSC fetches. SvelteKit assets live under `/_app/immutable/*`, and its client navigations fetch `__data.json` (GET). The asset bucket is never used, so the 'read-only offline' pages the worker serves from PAGES_CACHE load without their JS and CSS chunks. The data requests from client navigation also aren't handled. This is the PWA part of this lane; the builder flagged it, and the lane notes keep sw.js unchanged. → Coordinator: treat `/_app/immutable/` as cache-first. Decide how `__data.json` (x-sveltekit-invalidated) requests behave: network-only, or a cached copy so offline client navigation degrades the same way it did under Next.
- [minor] src/routes/+error.svelte: There is no root +error.svelte. Unmatched URLs, and errors thrown by the dashboard layout load itself (loadAppShellData/getSession failures), fall to Kit's unstyled default error page. Next rendered its built-in '404 | This page could not be found.' page there, and its default error page for errors. The builder copied that 404 text into dashboard/+error.svelte, but the root level has no equivalent. → Coordinator (no lane owns this file): add src/routes/+error.svelte with the same markup as the 404 branch of src/routes/dashboard/+error.svelte, plus a generic error state for non-404 errors.


### L1 fix report

# L1 fix report: app shell, navigation, dashboard home, PWA

I fixed the two findings in L1's own files and left the other three, because they're in files L1 doesn't own. The final kit-check over all L1 targets reports 0 errors. As before, I only checked types: none of this has been run in a browser.

## Findings

1. **Skeletons showing on navigations where Next showed none (`src/lib/components/app-shell/navigation-loading.svelte.ts`) — fixed.** `boundaryFor()` now compares only the first route segment below each boundary's owner, not the whole pathname. A new helper, `childKey(target, owner)`, returns that segment from the route id; dynamic parts like `[x]` are replaced with their values, and the owner's own page counts as `''`.
   - **Project boundary:** if `from` and `to` are in the same project (same `params.id`), the skeleton shows only when the segment after `/projects/[id]` changes (`''`, `issues`, `settings`, `cycles`, …). Otherwise nothing shows.
   - **Dashboard boundary:** nothing shows when `from` is under `/dashboard` and the segment after `/dashboard` is the same. Otherwise the dashboard skeleton shows.
   - **Result for the reported cases:** settings to settings tab, project settings to project settings tab, issue permalink to issue permalink, view to view, and project A to project B now show nothing; the old page stays visible and only the progress bar runs.
   - **Kept as before:** same-path and search-param-only navigations show nothing, and the `OWN_LOADING` exclusion is unchanged. I rewrote the header comment to describe the new rule.

2. **Inbox badge blinking on every refresh (`src/lib/components/app-shell/slots/inbox-badge.svelte`) — fixed.** I replaced `{#await}` with one `InboxBadgeCount` that stays mounted:
   - An `$effect` stores the last resolved count, and a newer promise cancels an older one still in flight.
   - The badge shows that last count while a new streamed promise is pending, and `initial` updates once the new value arrives. `InboxBadgeCount` already picks up a changed `initial` because it derives its count from it.
   - Nothing renders until the first count arrives, as before. A failed stream keeps the last count.

3. **`new-issue-bus.ts` using the React hotkey registry — skipped (not L1's file).** It's a shared module that lanes must import as it is. The fix the review asks for, a Svelte copy in `productivity/` used by both TopbarChrome and L7's NewIssueDialog/IssueShortcuts, belongs to L7 or the coordinator. Until it exists, `c` is handled by the React registry inside a project and doesn't appear in the `?` overlay. When the Svelte copy lands, `src/lib/components/topbar-chrome.svelte` needs a one-line import change.

4. **`public/sw.js` still Next-shaped — skipped (lane notes say it stays as it is).** Coordinator to-do: treat `/_app/immutable/*` as cache-first, and decide whether `__data.json` client-navigation requests are network-only or served from cache when offline.

5. **No root `src/routes/+error.svelte` — skipped (no lane owns it; the review assigns it to the coordinator).** Suggested content: the same markup as the 404 branch of `src/routes/dashboard/+error.svelte`, plus a generic error state for other errors.

## API changes other lanes must know

None. `useNavigationLoading()` still returns `{active, dashboard, project}`, and `InboxBadge` still takes `count: Promise<number> | number`.

## Final kit-check

```
kit-check: 0 error(s) in src/lib/components/app-shell src/lib/components/navigation src/lib/components/command-palette src/lib/components/project/project-tabs.svelte src/lib/components/project/slots src/lib/components/pwa src/lib/components/sync src/lib/components/topbar-chrome.svelte src/lib/components/user-menu.svelte src/lib/components/hotkey-overlay.svelte src/lib/components/project-list src/lib/components/create-project-dialog.svelte src/lib/components/wordmark.svelte src/lib/components/coming-soon.svelte src/lib/components/dashboard-greeting.svelte src/routes/+page src/routes/+layout.svelte src/routes/offline src/routes/dashboard/+ src/routes/dashboard/projects/+error.svelte src/routes/dashboard/projects/\[id\]/\+ src/routes/dashboard/projects/\[id\]/settings/\+layout src/routes/dashboard/settings/+layout
```

Files changed:
- /home/oscar/Projects/ticket-system/src/lib/components/app-shell/navigation-loading.svelte.ts
- /home/oscar/Projects/ticket-system/src/lib/components/app-shell/slots/inbox-badge.svelte


---

## L2 build report

# L2 report: auth, invites, OAuth consent, security, people

All 31 source files are ported, with no TODOs or stubs. The last `scripts/kit-check.sh` run over every L2 target reports **0 errors**. A separate svelte-check run at warning level shows no warnings in L2 files. Nothing has been run in a browser; this is type-checked only.

## 1. Source → target mapping
Paths are relative to `/home/oscar/Projects/ticket-system/`.

| Source | Target(s) |
|---|---|
| `src/app/(auth)/login/page.tsx` | `src/routes/(auth)/login/+page.server.ts`, `+page.svelte` |
| `src/app/(auth)/login/login-form.tsx` | `src/routes/(auth)/login/login-form.svelte` |
| `src/app/(auth)/login/two-factor/page.tsx` | `src/routes/(auth)/login/two-factor/+page.server.ts`, `+page.svelte` |
| `src/app/(auth)/login/two-factor/two-factor-form.tsx` | `src/routes/(auth)/login/two-factor/two-factor-form.svelte` |
| `src/app/(auth)/signup/page.tsx` | `src/routes/(auth)/signup/+page.server.ts`, `+page.svelte` |
| `src/app/(auth)/signup/signup-form.tsx` | `src/routes/(auth)/signup/signup-form.svelte` |
| `src/app/(auth)/safe-redirect.ts` | not copied: React-free, imported as is from `@/app/(auth)/safe-redirect` |
| (new helper) | `src/routes/(auth)/search-param.ts` (rebuilds Next's `searchParams` value shape) |
| `src/app/invite/[token]/page.tsx` | `src/routes/invite/[token]/+page.server.ts`, `+page.svelte` |
| `src/app/invite/workspace/[token]/page.tsx` | `src/routes/invite/workspace/[token]/+page.server.ts`, `+page.svelte` |
| `src/app/oauth/consent/page.tsx` | `src/routes/oauth/consent/+page.server.ts`, `+page.svelte` |
| `src/app/request/[token]/page.tsx` | `src/routes/request/[token]/+page.server.ts`, `+page.svelte` |
| `src/app/dashboard/people/[userId]/page.tsx` | `src/routes/dashboard/people/[userId]/+page.server.ts`, `+page.svelte` |
| `src/app/dashboard/people/[userId]/loading.tsx` | not ported, per PLAN (the dashboard layout's progress indicator replaces it) |
| `src/app/dashboard/settings/api-keys/page.tsx` | `src/routes/dashboard/settings/api-keys/+page.server.ts`, `+page.svelte` |
| `src/app/dashboard/settings/oauth-apps/page.tsx` | `src/routes/dashboard/settings/oauth-apps/+page.server.ts`, `+page.svelte` |
| `src/app/dashboard/settings/security/page.tsx` | `src/routes/dashboard/settings/security/+page.server.ts`, `+page.svelte` |
| `src/app/dashboard/workspaces/[slug]/security/page.tsx` | `src/routes/dashboard/workspaces/[slug]/security/+page.server.ts`, `+page.svelte` |
| `src/components/invite-panel.tsx` | `src/lib/components/invite-panel.svelte`, plus local `invite-panel-pending-row.svelte` and `invite-panel-utils.ts` |
| `src/components/join-project-button.tsx` | `src/lib/components/join-project-button.svelte` |
| `src/components/member-list.tsx` | `src/lib/components/member-list.svelte`, plus local `member-list-row.svelte` |
| `src/components/oauth/app-icon.tsx` | `src/lib/components/oauth/app-icon.svelte` |
| `src/components/oauth/authorized-apps.tsx` | `src/lib/components/oauth/authorized-apps.svelte` |
| `src/components/oauth/consent-form.tsx` | `src/lib/components/oauth/consent-form.svelte` |
| `src/components/oauth/oauth-app-settings.tsx` | `src/lib/components/oauth/oauth-app-settings.svelte`, plus local `oauth-app-register-dialog.svelte` |
| `src/components/people/local-time.tsx` | `src/lib/components/people/local-time.svelte` |
| `src/components/security/backup-codes.tsx` | `src/lib/components/security/backup-codes.svelte` |
| `src/components/security/scim-settings.tsx` | `src/lib/components/security/scim-settings.svelte` |
| `src/components/security/sessions-list.tsx` | `src/lib/components/security/sessions-list.svelte` |
| `src/components/security/setup-notes.tsx` | `setup-notes.svelte` (SetupNotes), `scim-notes.svelte` (ScimNotes), local `setup-notes-details.svelte` |
| `src/components/security/two-factor-settings.tsx` | `two-factor-settings.svelte`, plus local `two-factor-enable-dialog.svelte`, `two-factor-password-dialog.svelte`, `two-factor-password-field.svelte`, `two-factor-regenerate-dialog.svelte`, `two-factor-errors.ts` |
| `src/components/security/workspace-sso-settings.tsx` | `workspace-sso-settings.svelte`, plus local `workspace-sso-form.svelte` |

## 2. API decisions other lanes must know
- **Prop contracts are unchanged** (with `className` → `class`):
  - `<InvitePanel projectId inviteUrl pending?>`
  - `<MemberList members currentUserId projectId>`
  - `<JoinProjectButton token>`
  - `<AppIcon name src size? class?>`
  - `<ConsentForm app scopes user redirectHost>`
  - `<OAuthAppSettings origin apps>` and `<AuthorizedApps apps>`
  - `<LocalTime timeZone>`
  - `<SessionsList sessions currentId>`
  - `<TwoFactorSettings enabled hasPassword>`
  - `<ScimSettings workspaceId configured baseUrl>`
  - `<WorkspaceSsoSettings …>` with the same 8 props
  - `<BackupCodes codes>`, `<SetupNotes protocol>`, `<ScimNotes baseUrl>`
- **Types come from each component's `<script module>`:**
  - `PendingInvitation` from `invite-panel.svelte`
  - `MemberListMember` and `MemberListProps` from `member-list.svelte`
  - `SessionView` from `sessions-list.svelte`
  - `SsoProviderView`, `SsoUrls` and `Protocol` from `workspace-sso-settings.svelte`
  - `ConsentApp` from `consent-form.svelte`
- **Seeded-once state:** components that seeded `useState` from a prop (`apps`, `sessions`, `enabled`, `configured`, `enforced`) still do so once and then keep local state, like React.
- **Refreshing after actions:** I removed React's explicit `router.refresh()` wherever the generated wrapper already refreshes (security, members and invite actions). The calls that follow Better Auth client calls (2FA enable and disable) now use `refreshAfterWrite()`.
- **Login and signup navigation:** after a successful sign-in or sign-up the forms call `goto(redirectTo, { refreshAll: true })`, which replaces `router.push` plus `router.refresh`.
- **Remounting on param changes:** Next remounted a page when its dynamic segment changed; SvelteKit reuses it. So `{#key}` wraps the workspace security body (keyed on `workspaceId`), JoinProjectButton (on `token`) and AcceptWorkspaceInvite (on `token`).

## 3. Not ported 1:1, and why
- **`loading.tsx`** is not ported, per PLAN.
- **Not-found titles:** a missing profile or workspace now throws `error(404, 'Not found')`. Next's not-found titles ("Profile not found" / "Workspace not found") now come from L1's `+error.svelte`.
- **Session checks** use `locals.user` / `locals.session` instead of `getSession()`. The data is the same, set in `hooks.server.ts`.
- **Invite tokens:** SvelteKit already URL-decodes `params.token`, so the workspace invite page doesn't call `decodeURIComponent` a second time. Links re-encode the token. Tokens are base64url, so the result is the same.
- **People page:** the relative "ago" labels and activity summaries are computed in `load`. React also computed them on the server, at request time, and this avoids a hydration mismatch. Only the fields that are rendered are sent to the client.
- **`useTransition` → pending flags:** a shared pending flag is a counter, so overlapping calls keep it on until all of them finish.
- **Two smaller timing differences:**
  - The SSO "saved" toast now appears after the wrapper's refresh finishes (React showed it before refreshing).
  - InvitePanel's "expired" check is recomputed when the invitation changes, not on every render.
- **LocalTime** uses `isAppHydrated()`/`markAppHydrated()` to reproduce the `useSyncExternalStore` server snapshot: it shows only the zone name during the first hydration, and reads the clock right away when mounted by a client-side navigation.
- **Strict control:** the role Select, the SSO-enforced Switch, the ToggleGroups and the RadioGroup use function bindings, so they don't move until the state changes (Radix's controlled behaviour).

## 4. Cross-lane imports and the props I assumed
All of these exist now and type-check:
- **L1:** `@/lib/components/wordmark.svelte` (no props).
- **L9a:**
  - `workspaces/accept-workspace-invite.svelte` `{token}`
  - `integrations/intake-form.svelte` `{token, stamp}`
  - `integrations/api-key-settings.svelte` `{keys}`
  - `integrations/copy-field.svelte` `{id?, value, label?, multiline?, class?}`
  - `workspaces/permissions.svelte` → `useProjectPermissions()`, a live object with `assignableRoles`, `canManage` and `isOwner`. It must be called below a ProjectDataProvider, so L8's members page needs to render one.
- **L8:** `settings/field.svelte` `{id, label, hint?: string | Snippet, error?, children}`.
- **L3a:** `relativeTime` from `@/lib/components/issues/issue-properties`.
- **W1 primitives and state:** the UI primitives, ui-icons, `auth-client`, `refresh.svelte` and `hydration`.

## 5. Things the coordinator must do
No config, package or env changes are needed. When cutover moves the React-free modules (`role-rules`, `oauth-model`, `user-agent`, `activity-summary`, `(auth)/safe-redirect`), update the imports of them in L2 files.

## 6. Last kit-check result
```
kit-check: 0 error(s) in src/routes/\(auth\) src/routes/invite src/routes/oauth src/routes/request src/routes/dashboard/people src/routes/dashboard/settings/security src/routes/dashboard/settings/oauth-apps src/routes/dashboard/settings/api-keys src/routes/dashboard/workspaces/\[slug\]/security src/lib/components/oauth src/lib/components/security src/lib/components/people src/lib/components/invite-panel src/lib/components/join-project-button src/lib/components/member-list
```
There were no "Cannot find module" errors: by the last run every cross-lane file existed.


### L2 review

- [major] src/routes/dashboard/people/[userId]/+page.svelte: Svelte strips leading whitespace from the first text node inside an element. I confirmed this by compiling a sample with the repo's svelte 5.57.3: `<span class="a"> {t}</span>` compiles to `<span class="a">${t}</span>`, and ` in {l}` becomes `in ${l}`. Two places on the profile's Recent activity rows lose their space because of it. (1) Lines 145 and 147: `<span class="font-normal"> {item.title}</span>` now renders "ENG-12Fix login bug". React (page.tsx:260/265) rendered "ENG-12 Fix login bug". (2) Line 148: `<span class="text-muted-foreground"> in {item.projectName}</span>` now renders "Created a projectin Acme". React (page.tsx:271-274) used `{' '}in …`. The plan requires pixel and text parity. → Use an explicit expression for the space so Svelte keeps it: `<span class="font-normal">{' '}{item.title}</span>` (both places) and `<span class="text-muted-foreground">{' '}in {item.projectName}</span>`.
- [major] src/lib/components/people/local-time.svelte: The same whitespace stripping applies on lines 84-86. The offset span's text starts with a newline plus " · ", and the zone span's text starts with " · ". Svelte trims the leading whitespace of both, and nothing sits between "local time" and the `{#if offset}` span. The header therefore renders "9:05 AM local time· 3h ahead· Europe/Paris". React (local-time.tsx:70-72) rendered "9:05 AM local time · 3h ahead · Europe/Paris". Every profile with a time zone shows this. → Write the separators as expressions: `<span class="text-muted-foreground">{' · '}{offset}</span>` and `<span class="text-muted-foreground">{' · '}{label}</span>`. Keep `local time` immediately before the `{#if}`.
- [minor] src/lib/components/security/workspace-sso-form.svelte: Line 301 runs `toast.success(provider ? 'Single sign-on updated' : 'Single sign-on is set up')` after `await saveWorkspaceSso(input)`. The generated wrapper refreshes the page before it resolves (settle with refresh=true awaits refreshAfterWrite until page.data is replaced). `provider` compiles to a live `$$props.provider` read through the parent getters into the new page data. On first-time setup (provider null), the read after the await returns the newly saved provider. The admin then sees "Single sign-on updated" instead of React's "Single sign-on is set up". React's closure captured the render-time `provider`. → Capture the value before the await, e.g. `const wasNew = !provider;` (or use the untracked `initial` already at line 42), and use it for the toast.


### L2 fix report

# L2 review fixes

All three findings are fixed, no other lane needs an API change, and the final kit-check over every L2 target reports 0 errors. After the fixes I compiled both markup files with the repo's Svelte compiler (server output) and the missing spaces are now in the output.

## Findings

1. **Fixed: lost spaces in the Recent activity rows** (`/home/oscar/Projects/ticket-system/src/routes/dashboard/people/[userId]/+page.svelte`). Both title spans are now `<span class="font-normal">{' '}{item.title}</span>`, and the project span is `<span class="text-muted-foreground">{' '}in {item.projectName}</span>`. The compiled output is `<span class="font-normal"> ${item.title}</span>` and `<span class="text-muted-foreground"> in ${item.projectName}</span>`, which matches React.

2. **Fixed: lost separators in the local time header** (`/home/oscar/Projects/ticket-system/src/lib/components/people/local-time.svelte`). The separators are now `{' · '}{offset}` and `{' · '}{label}`, with `local time` still right before the `{#if offset}`. The compiled output is `local time` then `<span …> · ${offset}</span>` then `<span …> · ${label}</span>`. It now renders "9:05 AM local time · 3h ahead · Europe/Paris", as React did.

3. **Fixed: wrong toast on first-time SSO setup** (`/home/oscar/Projects/ticket-system/src/lib/components/security/workspace-sso-form.svelte`). `submit()` now records `const wasConfigured = !!provider;` before `await saveWorkspaceSso(input)`, and the toast uses `wasConfigured`. I didn't use the existing `initial`: it is read once when the form mounts, while React's closure held the `provider` from the render where the submit happened. The new value matches that.

I also searched the L2 files for other inline elements whose text starts with a space. I found no other cases; the only hits were `=>` inside `onclick` handlers. The people page's "· {count}" headings already matched React.

## API changes for other lanes
None. No props, exported types or behaviour contracts changed.

## Final kit-check
```
kit-check: 0 error(s) in src/routes/(auth) src/routes/invite src/routes/oauth src/routes/request src/routes/dashboard/people src/routes/dashboard/settings/security src/routes/dashboard/settings/oauth-apps src/routes/dashboard/settings/api-keys src/routes/dashboard/workspaces/[slug]/security src/lib/components/oauth src/lib/components/security src/lib/components/people src/lib/components/invite-panel src/lib/components/join-project-button src/lib/components/member-list
```


---

## L3a build report

I've ported all 23 L3a source files to Svelte, and the last kit-check over my paths shows 0 errors. All the cross-lane files I import already exist on disk and type-check, so there are no "Cannot find module" errors to list. Nothing has been run in a browser; this is type-checking only.

## 1. Source → target mapping
Paths are under `/home/oscar/Projects/ticket-system/`. Every component file starts with a comment explaining its contract.

| Source | Target(s) |
|---|---|
| `app/dashboard/projects/[id]/page.tsx` | `src/routes/dashboard/projects/[id]/+page.server.ts`, `+page.svelte` |
| `.../archive/page.tsx` | `src/routes/dashboard/projects/[id]/archive/+page.server.ts`, `+page.svelte` (title "Archive · Ticket System") |
| `.../trash/page.tsx` | `src/routes/dashboard/projects/[id]/trash/+page.server.ts`, `+page.svelte` (title "Trash · Ticket System") |
| `issues/issues-view.tsx` | `src/lib/components/issues/issues-view.svelte` (exports `IssuesViewProps`), `issues-view-root.svelte`, `issues-view-body.svelte` |
| `issues/views.tsx` | `issues/views.ts`, `list-view.svelte`, `issue-view-host.svelte` |
| `issues/view-switcher.tsx` | `issues/view-switcher.svelte` |
| `issues/issue-list.tsx` | `issues/issue-list.svelte`, `group-icon.svelte`, `sortable-issue-row.svelte`, `drop-list.svelte` |
| `issues/issue-row.tsx` | `issues/issue-row.svelte` (re-exports `relativeTime`, exports `IssueRowProps`), `row-button.svelte` |
| `issues/issue-properties.tsx` | `issues/issue-properties.ts` (exports `relativeTime` and re-exports the chips), `label-chips.svelte`, `estimate-chip.svelte`, `due-date-chip.svelte` |
| `issues/issue-context-menu.tsx` | `issues/issue-context-menu.svelte` (helper functions in its `<script module>`), `confirm-trash-dialog.svelte`, `coverage-mark.svelte` |
| `issues/new-issue-dialog.tsx` | `issues/new-issue-dialog.svelte` |
| `issues/slots/*` | `issues/slots/bulk-bar.svelte`, `label-toggles.svelte`, `issue-shortcuts.svelte`, `list-overlay.svelte`, `toolbar-extra.svelte` |
| `board/board.tsx` | `src/lib/components/board/board.svelte` (default export, lazy-loaded), `board-cell.svelte`, `column-header.svelte`, `board-layout.ts` |
| `board/board-card.tsx` | `board/board-card.svelte`, `board-card-content.svelte` |
| `similar/*` | `similar/possible-duplicates.svelte`, `use-possible-duplicates.svelte.ts` |
| `sla/sla-chip.tsx` | `sla/sla-chip.svelte` (`SLA_TONE`, `slaText` in its `<script module>`) |
| `sla/time-in-status.tsx`, `sla-settings-form.tsx` | `sla/time-in-status.svelte`, `sla-settings-form.svelte` |
| `sla/use-now.ts` | `sla/use-now.svelte.ts` |

## 2. API decisions other lanes must know
- **`IssuesView`** takes the same props as React. `emptyState` is now a `Snippet`. The component remounts when `savedView.id` changes, like React's `key`.
- **`IssueViewDefinition`** has the same `id`, `label` and `icon` (a `LucideIcon`). React's single `component` field is now either:
  - `component`, for the list, which is rendered directly; or
  - `lazy: { load, ssr, loading }`, for board, table, calendar and timeline.

  `IssueViewProps` is unchanged. Board, table, calendar and timeline must default-export a component that takes `IssueViewProps`.
- **`IssueContextMenu`** takes a `children: Snippet<[{ props }]>`, the replacement for asChild. Spread `props` onto the wrapper and merge its class with `cn(props.class, …)`.
- **`useMinuteNow()`** returns `{ current: number | null }`.
- **`usePossibleDuplicates(projectId, title, enabled)`** accepts values or getters and returns `{ current }`.
- **`IssueRow`** forwards any `{@attach}` you put on it to the row element.
- **Board and list** build their own `DragDropManager({ sensors })` as well as passing `sensors` (workaround for dnd-kit#2112). The list is pointer-only; the board uses pointer plus the same keyboard sensor config as React.

## 3. Not ported 1:1, and why
- **Lazy views on the server:** board and table were server-rendered by next/dynamic. Here the server renders only their skeleton, as PLAN prescribes for `next/dynamic`. Calendar and timeline were client-only in React too.
- **`?create` / `?draft` / `?template` stripping** uses `setSearchParams` instead of `router.replace`, so no load functions re-run. A `goto` navigation could cancel an in-flight refresh (W1c's finding).
- **`{#key params.id}` on the three pages:** I added these because SvelteKit reuses page components across projects, while Next remounted them.
- **Row focus:** the row uses `onfocusin` to match React's bubbling `onFocus`.
- **Variable renames:** I renamed the locals `state` and `props` in new-issue-dialog, because they collide with the `$state` and `$props` runes.
- **Dropped attribute:** `suppressHydrationWarning` has no Svelte equivalent, so it's gone.
- **Warnings silenced:** three a11y warnings have `svelte-ignore` comments, on markup kept identical to React.

## 4. Cross-lane imports (all present and type-checking)
- **L4 pickers:** `@/lib/components/issue-pickers` takes `children({ props })` as the trigger and `content(close)`. Also `issue-detail/issue-detail-pane.svelte` (`issue`, `mutations`, `onClose`).
- **L7:** `cycles/cycle-picker.svelte` and these `productivity/` modules:
  - `issue-actions.ts`, `new-issue-bus.svelte.ts`
  - `templates-store.svelte.ts` (getters supported)
  - `use-draft-autosave.svelte.ts` (getters supported)
  - `property-chips.svelte`, `template-menu.svelte`
  - `issue-command-dialog.svelte`
- **L6:** `epics/epic-picker.svelte`.
- **L1:** `navigation/issue-bin.svelte`, `issue-peek.svelte`, `save-view-dialog.svelte`.
- **L3b:** `views/use-sortable-groups.svelte.ts` (`useSortableGroups(() => ({ containers, mutations, manual }))`), `display-menu.svelte`, `table-view.svelte`, `calendar-view.svelte`, `timeline-view.svelte`, and the `*-chip.svelte` files.
- **W1c:** the issues state modules and providers, `search-params`, `hotkeys`, `palette-commands`, `hydration`.

## 5. Coordinator actions
None needed: there are no config, package or env changes. `dnd-helpers-svelte` and `@dnd-kit/svelte` are already installed.

## 6. Last kit-check
```
kit-check: 0 error(s) in src/lib/components/issues src/lib/components/board src/lib/components/sla src/lib/components/similar src/routes/dashboard/projects/\[id\]/\+page src/routes/dashboard/projects/\[id\]/archive src/routes/dashboard/projects/\[id\]/trash
```
A full run with warnings enabled showed one project-wide error, in `src/components/editor/actions.ts` (React code, not mine). The only warnings in my files were the ones fixed or silenced above.


### L3a review

- [minor] src/lib/components/issues/issue-view-host.svelte: Lines 22-30 and 51-61. Board and table were server-rendered in React (next/dynamic with ssr on by default). Here they render only their skeleton on the server and during hydration: `pending` is null when `!browser`, so the `{:else}` skeleton branch renders. The `ssr` field in views.ts (lines 71-72) is never read, so `ssr: true` and `ssr: false` behave the same. Two concrete effects. (1) A viewer whose VIEW_COOKIE or saved layout is `board` sees the skeleton and then the board, with a layout shift, on every full page load, where React painted the board on first load. The client then hydrates a different branch than the server rendered (`{:else if pending}` against the server's `{:else}`), so Svelte throws away the server nodes and rebuilds them. (2) The `{#await pending}` block has no `{:catch}`. If a view chunk fails to load (for example a stale deploy), the view area stays empty and shows no error. With next/dynamic the error went to the error boundary. → Either honour `lazy.ssr`, for example by awaiting `view.lazy.load()` on the server for ssr views through async SSR or an `await` expression so board and table HTML is server-rendered as in React, or remove the unused `ssr` field and document skeleton-on-SSR as the deliberate behaviour. Add a `{:catch}` branch that rethrows, or shows the same error UI as +error.svelte, so a failed chunk load isn't silently blank.


### L3a fix report

I fixed the one finding. The lane's kit-check shows 0 errors, but this is type-checking only: I didn't render board or table on a real server, or hydrate them in a browser.

## Finding: `src/lib/components/issues/issue-view-host.svelte`, fixed

**1. `ssr` is now read, and board and table render on the server again.**
- Code-split views now load inside a `<svelte:boundary>` that gets a new key for each view, using `{@const View = await loadView(view)}`.
- The boundary's `pending` is `undefined` on the server when `view.lazy.ssr` is true. With no loading snippet, the server waits for the chunk and renders the board or table HTML, as next/dynamic did. I checked the compiled server code: it skips the skeleton when `pending` is empty and waits for the import instead.
- Calendar and timeline still render the skeleton on the server, as `ssr: false` did in React.
- On the client the boundary always has the skeleton as its `pending`. During hydration it follows whatever the server rendered, so the client keeps the server's nodes instead of throwing them away. It shows no skeleton and has no layout shift for board or table.
- The cache of loaded views is now used only in the browser. Before, the server's copy filled up after the first request, so the server and the hydrating client could take different branches. Switching back to a view that's already loaded still renders at once. Switching to a new one shows the skeleton, because each view gets a fresh boundary.

**2. A failed chunk load no longer leaves the area blank.**
- The boundary now has a `failed` branch. It shows the same "Something went wrong" message and "Try again" button as `src/routes/dashboard/+error.svelte`, inside the view area, and logs the error to the console.
- "Try again" resets the boundary, which re-runs the import. Calling the page error's retry wouldn't have done that, because it reloads data, not code.
- I didn't make it rethrow. This project has no app-wide handler for rendering errors in SvelteKit, so a rethrown error on the client would leave the page broken with no message.

**Also changed:** the comments on `ssr` in `src/lib/components/issues/views.ts` (lines 7–9 and the `LazyIssueView.ssr` doc) now describe what it actually does.

**Still to check in a browser:**
- Board and table now run on the server. Building the board's drag-and-drop manager in plain Node works. I haven't run full server rendering of `board.svelte` or `table-view.svelte`. Table only touches `document` inside an event handler, so it shouldn't be a problem.
- Hydrating the server-rendered `await` without a skeleton relies on Svelte 5.57's async hydration, which I read in the source but haven't seen run.

## API changes other lanes must know
- No signatures changed. `IssueViewDefinition` and `LazyIssueView` keep the same shape. `lazy.ssr` is now honoured.
- **For L3b's `table-view.svelte`:** table views are now rendered on the server (along with the board). Their top-level script and markup must not touch `window`, `document` or `localStorage` outside effects and event handlers.

## Final kit-check
```
kit-check: 0 error(s) in src/lib/components/issues src/lib/components/board src/lib/components/sla src/lib/components/similar src/routes/dashboard/projects/\[id\]/\+page src/routes/dashboard/projects/\[id\]/archive src/routes/dashboard/projects/\[id\]/trash
```

Files changed:
- /home/oscar/Projects/ticket-system/src/lib/components/issues/issue-view-host.svelte
- /home/oscar/Projects/ticket-system/src/lib/components/issues/views.ts (comments only)


---

## L3b build report

All 15 L3b source files are ported, with no stubs or TODOs. The last kit-check shows 1 error: "Cannot find module" for `document-icon.svelte`, which lane L5 hasn't written yet. Everything is type-checked only; nothing has been run in a browser or against a database.

## (1) Source → target mapping
Components live under `src/lib/components/views/` and routes under `src/routes/dashboard/`.

| Source | Target(s) |
|---|---|
| `views/use-sortable-groups.ts` | `views/use-sortable-groups.svelte.ts` |
| `views/property-chips.tsx` | `cycle-chip.svelte`, `epic-chip.svelte`, `milestone-chip.svelte`, `sub-issue-chip.svelte`, `start-date-chip.svelte`, plus a barrel `property-chips.ts` |
| `views/search-syntax-help.tsx` | `search-syntax-help.svelte` (exports `appendToken` from its module script), `search-term-chips.svelte` |
| `views/filter-menu.tsx` | `filter-menu.svelte`, `filter-chips.svelte`, and a shared helper `filter-properties.svelte.ts` |
| `views/display-menu.tsx` | `display-menu.svelte` |
| `views/calendar-view.tsx` | `calendar-view.svelte`, plus local parts `calendar-issue-chip`, `calendar-draggable-chip`, `calendar-day-cell`, `calendar-no-date-sidebar` (`.svelte`) |
| `views/table-view.tsx` | `table-view.svelte`, plus local parts `table-cell-button`, `table-sub-issues-cell` (`.svelte`) |
| `views/timeline-view.tsx` | `timeline-view.svelte`, plus local part `timeline-row.svelte` |
| `my-issues/page.tsx` + `queries.ts` | `my-issues/+page.server.ts`, `+page.svelte`, `queries.server.ts` (verbatim copy) |
| `search/page.tsx` | `search/+page.server.ts`, `+page.svelte` |
| `views/page.tsx` | `views/+page.server.ts`, `+page.svelte` |
| `views/[viewId]/page.tsx` | `views/[viewId]/+page.server.ts` (redirect only), plus an empty `+page.svelte` |
| `projects/[id]/views/page.tsx` | `projects/[id]/views/+page.server.ts`, `+page.svelte` |
| `projects/[id]/views/[viewId]/page.tsx` | `projects/[id]/views/[viewId]/+page.server.ts`, `+page.svelte` |

## (2) API decisions other lanes must know
- **`useSortableGroups(() => ({ containers, mutations, manual }))`** takes a getter and returns a `SortableGroups` instance:
  - `itemsOf(id)` and `issueOf(id)` are unchanged.
  - `dragging` is a reactive getter.
  - `handlers` is `{ onDragStart, onDragOver, onDragEnd }`, to spread onto `<DragDropProvider>`.
  - `sortableId` and the `SortableContainer` type are unchanged.
  - The issue list and board (L3a) already use it this way.
- **FilterMenu / FilterChips:** same props as React.
  - Import the `FilterPropertyId` type from `filter-properties.svelte.ts` or from `filter-menu.svelte`'s module script.
  - Option icons are now plain descriptors (`FilterOptionIcon`) instead of ReactNodes.
  - `useFilterProperties()` returns `{ current }` and, as in React, throws outside a project data provider.
- **`appendToken`:** `import SearchSyntaxHelp, { appendToken } from '@/lib/components/views/search-syntax-help.svelte'`. The inline copies in `issue-filters.svelte` (W1c) and `widget-editor-form.svelte` can switch to it.
- **DisplayMenu:** takes `views: Pick<IssueViewDefinition, 'id'|'label'|'icon'>[]`, so `ISSUE_VIEWS` can be passed as is. Shift+V toggles it.
- **The three views:** `table-view`, `calendar-view` and `timeline-view` are default-export components that take `IssueViewProps` from `@/lib/components/issues/views`.

## (3) Not ported 1:1, and why
- **Calendar sensors:** the calendar builds its own `DragDropManager({ sensors: [PointerSensor] })` and destroys it on unmount. This works around dnd-kit#2112, where items registered early would keep the default sensors.
- **`suppressHydrationWarning`** (start-date chip, table time cells) has no Svelte equivalent. If server and browser timezones differ, the text may stay as the server rendered it until the next update.
- **Calendar "today"** is recomputed whenever the issues or the month change, rather than on every render as in React. The visible result is the same.
- **Saved-view page:** `SavedViewIssues` is wrapped in `{#key view.id}` so that moving between views re-seeds filters and display options, as the remounted Next page did.
- **Repeated `?tab=` params on My issues** fall back to "assigned", matching Next, which received them as an array.
- **Auth checks** read `locals.user` instead of calling `getSession()` again. It is the same Better Auth session.
- **Accessibility warnings:** two `svelte-ignore` comments silence warnings on markup that is identical to React's (focusable divs without a role).

## (4) Cross-lane imports and the props I assumed
- **L4:**
  - `@/lib/components/issue-pickers`: `keywordFilter` and the six pickers, using a `children({ props })` trigger snippet and `onCloseAutoFocus`.
  - `issue-detail/slots/start-date-picker.svelte`.
  - Both exist and type-check.
- **L3a:**
  - `issues/views` for the `IssueViewProps` and `IssueViewDefinition` types.
  - `issues/issue-properties` for `DueDateChip`, `EstimateChip`, `LabelChips` and `relativeTime`.
  - `sla/sla-chip.svelte` (`issue`).
  - All exist.
- **L1:**
  - `project-list.server` (`getProjectsForUser`).
  - From `navigation/`:
    - `issue-groups`, `page-tabs`, `highlight`, `favorite-button`
    - `list-navigation` (NavList, `class`)
    - `nav-issue-row` (`title` and `below` as snippets)
    - `search-controls`, `saved-view-issues`
    - `view-list` (`views`, `showProject`)
  - All exist.
- **L5:** `documents/document-icon.svelte` with props `icon` and `class`. This is the one file still missing.
- **React-free modules, imported unchanged:** `@/components/documents/document-model` (`documentPath`).

## (5) For the coordinator
- Nothing is needed for packages, config or env. This lane uses `@dnd-kit/svelte`, `@dnd-kit/dom` and `dnd-helpers-svelte`, which are already installed.
- At cutover, delete `src/app/dashboard/my-issues/queries.ts`; the Svelte app uses the copy in `queries.server.ts`.

## (6) Last kit-check
```
"src/routes/dashboard/search/+page.svelte" 7:28 "Cannot find module '@/lib/components/documents/document-icon.svelte' or its corresponding type declarations."
kit-check: 1 error(s) in src/lib/components/views src/routes/dashboard/my-issues src/routes/dashboard/search src/routes/dashboard/views src/routes/dashboard/projects/\[id\]/views
```
A separate warning-level svelte-check run shows no warnings in these files.


### L3b review

- [major] src/routes/dashboard/projects/[id]/views/[viewId]/+page.svelte: The `{#key view.id}` block at lines 46-58 only wraps `<SavedViewIssues>`, so the remount that Next did on a `[viewId]` change is only partly reproduced. `<FavoriteButton targetType="view" targetId={view.id} initial={data.favorited} />` at line 42 sits outside the key. FavoriteButton (src/lib/components/navigation/favorite-button.svelte, around line 28) seeds `let favorited = $state(initial ?? false)` once, with a `state_referenced_locally` ignore. SvelteKit reuses the page component when you go from /dashboard/projects/P/views/A to /views/B, for example from the sidebar favorites. The star then keeps showing view A's favorited state for view B. Next remounted the whole page segment (the param value is part of the router cache key), so React always showed B's real state. Clicking the star toggles B on the server and then corrects itself, but until then the wrong state is shown. → Widen the key so it wraps the whole page body. Either put `{#key view.id}` around the outer `<div class="flex min-h-0 flex-1 flex-col">`, or at least wrap the `<FavoriteButton>` in its own `{#key view.id}`. Then FavoriteButton re-seeds from `data.favorited` on every view change, as the remounted Next page did.


### L3b fix report

The review finding is fixed, and kit-check now passes with 0 errors in this lane's files. Nothing has been run in a browser.

## Finding

**Fixed:** `src/routes/dashboard/projects/[id]/views/[viewId]/+page.svelte`, the `{#key view.id}` block didn't cover the favorite star. I moved the key up so it wraps the whole page body (the outer `<div class="flex min-h-0 flex-1 flex-col">`), and removed the old key that only wrapped `<SavedViewIssues>`. The `<svelte:head>` title stays outside the key and still updates reactively.

Going from one saved view to another now remounts the back link, header, `<FavoriteButton>` and `<SavedViewIssues>` together, the way Next remounted the page. The star takes its state from the new view's `data.favorited`, and filters and display options reset as before.

I didn't re-indent the lines inside the key, so the diff only shows the moved key lines.

No other page in this lane uses `FavoriteButton`. The only other `{#key}` in the lane, in `filter-menu.svelte`, is unrelated.

## API changes for other lanes
None.

## Note
This repo's `CLAUDE.md` says to make edits through a GSD command first. I edited directly, as the workflow assigned. Your global policy also rules out optional plugins other than herdr, and GSD would be one of those.

## Final kit-check
```
kit-check: 0 error(s) in src/lib/components/views src/routes/dashboard/my-issues src/routes/dashboard/search src/routes/dashboard/views src/routes/dashboard/projects/[id]/views
```
The builder's one remaining error (the missing `@/lib/components/documents/document-icon.svelte`) is gone, so lane L5 has presumably written that file now.


---

## L4 build report

# L4 report: issue detail, hierarchy and pickers

All 36 source files are ported, with no stubs or TODOs. The last kit-check over my targets gave **0 errors**, and a warning-level svelte-check shows nothing in my files. None of this has been run in a browser; it only type-checks.

All targets are under `/home/oscar/Projects/ticket-system/src/lib/components/` unless the path starts with `src/routes`.

## 1. Source → target mapping

**Route: `issues/[key]/page.tsx`**
- `src/routes/dashboard/projects/[id]/issues/[key]/+page.server.ts`: same `getProjectData` / `getIssueByKey(id, n, userId)` / `getProjectIssues` calls.
  - Not found → `error(404, 'Issue not found')`.
  - A key or project that isn't canonical → `redirect(303, issuePath(...))`.
- `src/routes/dashboard/projects/[id]/issues/[key]/+page.svelte`: renders L1's `IssuePermalink`, with the title `"{key} {title} · Ticket System"`.

**issue-detail/**
| Source | Target |
|---|---|
| `issue-detail.tsx` | `issue-detail/issue-detail.svelte` (React's `PropertyButton` and `Muted` became snippets) |
| `issue-detail-pane.tsx` | `issue-detail/issue-detail-pane.svelte` and `issue-detail/use-is-desktop.svelte.ts`; `useIsDesktop` is also re-exported from the pane's module script |
| `property-row.tsx` | `issue-detail/property-row.svelte` |
| `use-draft.ts` | `issue-detail/use-draft.svelte.ts` |

**issue-detail/slots/** (the slot names are unchanged, as `.svelte`; local helper components became their own files)
| Source | Local helper files |
|---|---|
| `description-editor.tsx` | `collaborative-description.svelte` |
| `header-remind.tsx` | `remind-button.svelte` |
| `property-start-date.tsx` | `start-date-picker.svelte` (the exported `StartDatePicker`), `start-date-options.svelte` |
| `section-attachments.tsx` | `attachment-link-form.svelte` |
| `section-customers.tsx` | `customer-request-row.svelte`, `customer-options.svelte`, `add-customer-request.svelte` |
| `section-relations.tsx` | `add-relation.svelte`, `relation-kinds.ts` |

The other 14 slots each became one `.svelte` file with the same name.

**issue-hierarchy/**
| Source | Target |
|---|---|
| `issue-ref-row.tsx` | `issue-ref-row.svelte`, `section-header.svelte` |
| `issue-search-picker.tsx` | `issue-search-picker.svelte`, `issue-search-options.svelte` (generic `T extends IssueRef`) |
| `open-issue.ts` | `open-issue.svelte.ts` |

**issue-pickers/**
- Each `x-picker.tsx` became `x-picker.svelte` plus `x-options.svelte`.
- `picker-popover.tsx` became `picker-popover.svelte` plus `picker-utils.ts`, which holds `keywordFilter`, `digitShortcut` and `LABEL_COLORS`.
- `index.ts` keeps every React export name, including the `*OptionsProps` and `PickerPopoverProps` types.

## 2. API decisions other lanes must know

**Picker triggers.** React rendered the trigger through `asChild`. Here the trigger is a `children` snippet that receives `{ props }`, and you spread `props` on your element:
```svelte
<StatePicker value={id} onChange={…}>{#snippet children({ props })}<Button {...props}>…</Button>{/snippet}</StatePicker>
```
This applies to every picker, `PickerPopover`, `IssueSearchPicker` and `StartDatePicker`.
- `PickerPopover`'s `content(close)` becomes `{#snippet content(close)}`.
- `open` / `onOpenChange` work as in React, and `bind:open` also works. Leaving both out makes the popover uncontrolled.
- `PickerPopoverProps` and the `PickerTrigger` type are exported from the module script of `picker-popover.svelte` and from the barrel.

**Other exports**
- **`digitShortcut(search, pick)`** returns a DOM `(e: KeyboardEvent) => void` handler, for use as `onkeydown`.
- **`useDraft(() => saved)`** returns `{ current, set }`, so `bind:value={draft.current}` works. It resets only when the saved string actually changes.
- **`useIsDesktop()`** returns `{ current }`. It is `true` on the server and during first hydration, matching React's server snapshot.
- **`useOpenIssue()`** must be called during component init; it reads `?issue` at the moment it is called.
- **`SectionHeader`** takes `meta` and `children` as snippets. **`IssueRefRow`** takes `trailing` as a snippet and `class`.
- **`IssueDetail`, `IssueDetailPane`, `PropertyRow` and every slot** keep their React props (`issue`, `mutations`, `variant`, `onClose`, `readOnly`, `label`).

## 3. Not ported 1:1

- **Mention announcements read the old description first.** `DescriptionEditor` saves the previous description before calling `mutations.update`. In Svelte, the optimistic issue is visible right after that call, so reading it afterwards would find no new mentions.
- **Pages refresh later than in React.**
  - `addLink` and `deleteAttachment` refresh the page inside their action wrapper, so the popover closes and the row appears after that refresh rather than before it.
  - After a successful upload I call `refreshAfterWrite()` myself, because uploads go through `fetch('/api/attachments')`, not a wrapper.
  - The `deleteAttachment` wrapper refreshes even when the delete fails; React refreshed only on success.
- **Quick date options are computed once.** In the due-date and start-date lists, "Today", "Tomorrow" and the rest are worked out when the popover opens, not on every render.
- **`suppressHydrationWarning` has no Svelte equivalent.** The created/updated/SLA dates keep the server's text until they re-render. React with `suppressHydrationWarning` didn't patch that text either.
- **Not-found title.** The "Issue not found" title now travels as the error message. L1's `+error.svelte` decides whether to show it as the title.

## 4. Cross-lane imports (all exist and type-check against my usage)

- **L1:**
  - `navigation/favorite-button.svelte` (`targetType`, `targetId`)
  - `navigation/issue-permalink.svelte` (`issue`, `projectIssues`)
  - `useProjectPresence(getter, getter)` from `project/slots/live-updates.svelte.ts`
- **L3a:**
  - `issues/label-chips.svelte`
  - `issues/due-date-chip.svelte`
  - `relativeTime` from `issues/issue-properties`
  - `SLA_TONE` / `slaText` from `sla/sla-chip.svelte` (module script)
  - `sla/time-in-status.svelte` (`issue`, `now`)
  - `useMinuteNow()` from `sla/use-now.svelte`, which returns `{ current }`
- **L5:**
  - `Markdown` (`source=`) and `MarkdownEditor` (React props, `textareaClassName`, `onEditor`) from the `editor` barrel
  - `editor/rich-editor-provider.svelte`
  - `collab/use-collab.svelte` and `collab/use-collab-editor.svelte` (getter options)
  - `collab/collab-avatars.svelte` and `collab/collab-status-badge.svelte`
  - `IssueActivity` from `comments`
- **L6:**
  - `epics/epic-icon.svelte`, `epics/milestone-glyph.svelte`
  - `epics/epic-picker.svelte`, `epics/milestone-picker.svelte` (children snippet, `onOpenChange`)
  - `useForeignEpics(getter, getter)` from `epics/foreign-epics-store.svelte`
- **L7:**
  - `cycles/cycle-picker.svelte`, `cycles/cycle-glyph.svelte`
  - `inbox/when-picker.svelte`
  - `copyIssueMarkdown` / `duplicateInput` from `productivity/issue-actions`
  - `useTemplates(getter, false)` / `setCachedTemplates` from `productivity/templates-store.svelte`
- **L8:**
  - `developer/vcs-mark.svelte`
  - `useVcsConnections(getter)` from `developer/use-vcs-connections.svelte`
  - `useGithubViewer(getter)` from `github/use-github-viewer.svelte`
- **L9a:** `customers/customer-logo.svelte`, `customers/importance-icon.svelte`, `customers/request-source-icon.svelte`.

## 5. For the coordinator

- No package, config or env changes are needed.
- I did not follow the project CLAUDE.md's GSD workflow. The lane instructions define this workflow, and Oscar's global extension policy forbids optional skills (W1a did the same).

## 6. Last kit-check
```
kit-check: 0 error(s) in src/lib/components/issue-pickers src/lib/components/issue-hierarchy src/lib/components/issue-detail src/routes/dashboard/projects/\[id\]/issues
```
There are no "Cannot find module" errors: every cross-lane file I import already exists.


### L4 review




---

## L5 build report

L5 is fully ported: every file in `"L5".files` has a Svelte target and nothing is stubbed. The last `scripts/kit-check.sh` run over my targets reports 0 errors. I only type-checked; nothing has been run in a browser.

Lanes L4, L6, L7 and L9a have already started importing these modules (`Markdown source=`, `useCollab`, `useCollabEditor`, `EpicPicker`), and their usage matches the APIs below.

## 1. Source → target mapping
Component targets are under `src/lib/components/<dir>/`; routes are under `src/routes/dashboard/projects/[id]/docs/`.

| Source | Target(s) |
|---|---|
| `editor/actions.ts` (`'use server'`) | `editor/actions.remote.ts`. The generator only scans `src/app`, so I wrote this wrapper; it calls the same `suggestIssues` body. |
| `editor/embed-frame.tsx` | `editor/embed-frame.svelte` |
| `editor/embed-node-view.tsx` | `editor/embed-node-view.svelte` (svelte-tiptap `NodeViewWrapper`) |
| `editor/extensions.ts` | `editor/extensions.ts`. Same configuration; the node view uses `SvelteNodeViewRenderer` and the icons come from @lucide/svelte. |
| `editor/markdown-io.ts` | `editor/markdown-io.ts` (only change: `JSONContent` now comes from `@tiptap/core`) |
| `editor/markdown.tsx` | `editor/markdown.svelte`, `editor/mention-chip.svelte`, `editor/markdown-plugins.ts` (remark plugins, `PROSE_BASE`, and `rehypeSafe`, which reproduces react-markdown's `skipHtml` + `urlTransform`) |
| `editor/markdown-editor.tsx` | `editor/markdown-editor.svelte`, `editor/toolbar-button.svelte` |
| `editor/raw-editor.tsx` | `editor/raw-editor.svelte` |
| `editor/rich-editor.tsx` | `editor/rich-editor.svelte` (also exports `serializeMarkdown`) |
| `editor/suggestion-menu.tsx` | `editor/suggestion-menu.svelte`, `editor/member-option.svelte`, `editor/entry-option.svelte`, `editor/suggestion-entries.ts` (`MENU_WIDTH`, `MENU_CLASS`, `SlashCommand`, `SuggestionEntry`, `entryKey`) |
| `editor/index.ts` | `editor/index.ts` |
| `collab/use-collab.ts` | `collab/use-collab.svelte.ts` |
| `collab/use-collab-editor.ts` | `collab/use-collab-editor.svelte.ts`, plus `collab/reconcile.ts` (pure `reconcileTarget`, identical logic; also re-exported from the hook file) |
| `collab/collab-avatars.tsx` | `collab/collab-avatars.svelte`, `collab/collab-status-badge.svelte` |
| `comments/activity-line.tsx` | `comments/activity-line.svelte` (module script exports `expandActivities`, `ActivityLineItem`) |
| `comments/comment-composer.tsx` | `comments/comment-composer.svelte` |
| `comments/comment-item.tsx` | `comments/comment-item.svelte` (module script exports `isPendingComment`, `commentAnchor`, `CommentHandlers`) |
| `comments/issue-activity.tsx` | `comments/issue-activity.svelte` |
| `comments/reactions.tsx` | `comments/reaction-bar.svelte`, `comments/reaction-picker.svelte`, `comments/reactions.ts` (`toggleReactionGroups`) |
| `comments/timestamp.tsx` | `comments/timestamp.svelte`, `comments/relative-time.ts` |
| `comments/index.ts` | `comments/index.ts` |
| `documents/document-icon.tsx` | `documents/document-icon.svelte` |
| `documents/document-view.tsx` | `documents/document-view.svelte`, `documents/document-body.svelte`, `documents/icon-picker.svelte` |
| `documents/documents-list.tsx` | `documents/documents-list.svelte` (module script exports `copyDocumentLink`), `documents/delete-document-dialog.svelte`, `documents/document-search.svelte` |
| `documents/epic-documents.tsx` | `documents/epic-documents.svelte` |
| `documents/new-document-menu.tsx` | `documents/new-document-menu.svelte`, `documents/use-create-document.svelte.ts` |
| `docs/page.tsx` | `docs/+page.server.ts`, `docs/+page.svelte` |
| `docs/[docId]/page.tsx` | `docs/[docId]/+page.server.ts`, `docs/[docId]/+page.svelte` (wrapped in `{#key document.id}`) |

## 2. API decisions other lanes must know
- **Markdown:** `<Markdown>{text}</Markdown>` becomes `<Markdown source={text} />`. Svelte child content is a snippet, not a string. The other props are unchanged (`projectId`, `ticketKey`, `onToggleTask`, `embeds`, `class`).
- **MarkdownEditor:**
  - Same props as React, except `className` → `class` and `actions` is a snippet.
  - React's `ref` becomes `bind:this`. The instance exports `focus()` and `getEditor()`; `MarkdownEditorHandle` is `{ focus, getEditor }`.
  - Keep the `extensions` array identity stable (use a `$derived`, never a deep `$state`), or the editor is rebuilt.
- **`useCollab(key | () => key, user | () => user)`** returns live getters `provider`, `extensions` and `snapshot`. Don't destructure the result. The provider is only created in the browser; the server renders the IDLE snapshot.
- **`useCollabPeers(provider | getter, selfId | getter)`** returns `{ current }`.
- **`useCollabEditor(() => ({ provider, snapshot, editor, markdown, truth, hasPeers, onSave, onAdopted?, delay? }))`** takes a getter so the options stay live, and returns `{ state, onChange }`. `markdown` and `truth` are read once at start, like React's initial ref.
- **The adoption logic is ported line by line:** `collab-meta.adoptedRev` is written in the same transaction as the adopted content, `whenPersisted` runs before `onAdopted`, and external edits are applied even with peers present.
- **`useCreateDocument(projectId | getter, epicId? | getter)`** returns `{ create, pending }`, where `pending` is a getter.
- **Context:** `RichEditorProvider`, `setRichEditorContext` and `useRichEditorContext` are W1c's, re-exported from `@/lib/components/editor`.
- **Navigation after document actions:** the generated wrappers already refresh the page, so the React `router.refresh()` calls were dropped as the coordinator notes require. Deleting from the doc page then calls `goto(documentsPath)`.

## 3. Not ported 1:1, and why
- **`relativeTime`** lives in L3a's `issue-properties.tsx`, which has no Svelte home yet. I put an identical copy in `comments/relative-time.ts`; it should be deduplicated later.
- **Raw editor `onSelect`:** React's synthetic `onSelect` fires on any selection change. I reproduced that with keyup, mouseup, focus and `selectionchange` listeners, deduplicated on the selection range, so caret moves still open and close the @mention menu.
- **Container `onBlur`** is ported as `onfocusout` (React's onBlur bubbles; Svelte's doesn't).
- **Escape in the document title:** Svelte resets the title before the blur, so Escape really reverts it. In React, the blur handler probably still saw the edited title and saved it. This is a possible behaviour difference, in the intended direction.
- **Stale suggestion menu:** the menu is now cleared when the editor is rebuilt. In React a stale menu could stay open pointing at the destroyed editor.
- **Rendered task checkboxes** are kept controlled like React: the box reverts until the new source comes back.
- **Possible error-page flash:** `deleteDocument`'s wrapper refreshes the doc page before `goto`, so the 404 error page may show briefly. Next behaved much the same.
- **Other renames:** `suggestion-menu.svelte` takes a CSS string for `style`. `suppressHydrationWarning` has no Svelte equivalent and isn't needed.

## 4. Cross-lane imports I rely on
All of these exist now and type-check:
- **L6:** `@/lib/components/epics/epic-icon.svelte` (`color`, `class`) and `epic-picker.svelte` (`value`, `epics`, `onChange`). The trigger is `{#snippet children({ props })}`, which matches L4's `PickerTrigger`.
- **W1a/W1b/W1c primitives:** button, dropdown-menu, alert-dialog, popover, tooltip, toggle-group, ui-icons, project-data, hydration, palette-commands.
- **React-free modules imported unchanged:** `@/components/editor/{embeds,text-edits,upload}`, `documents/document-model`, `epics/epic-model`.

## 5. For the coordinator
- **The remote file outside `src/lib/remote`:** `src/lib/components/editor/actions.remote.ts` is hand-written because the generator doesn't scan `src/components`. Either keep it, or extend `gen-remote-actions.mjs` and delete it.
- **Two test-import repoints at cutover:**
  - `src/tests/local-db/description-source.test.ts` imports `reconcileTarget`; point it at `@/lib/components/collab/reconcile`.
  - Point the Next-only `relativeTime` import at L3a's future location.
- **Packages:** no new ones are needed, but `@types/mdast` must remain resolvable. It currently comes in through react-markdown.
- **The doc pages need the project layout (L1)** to set `ProjectDataProvider`.

## 6. Last kit-check
```
kit-check: 0 error(s) in src/lib/components/editor src/lib/components/collab src/lib/components/comments src/lib/components/documents src/routes/dashboard/projects/\[id\]/docs
```
There were no "Cannot find module" errors: the L6 files I import already exist.


### L5 review

- [minor] src/lib/components/comments/timestamp.svelte: Line 39: `<time {...props} …>` takes the bits-ui TooltipTrigger child props, and those include `tabindex: 0`. bits defaults `tabindex = 0` in tooltip-trigger.svelte:21/29 and emits it in tooltip.svelte.js:635. In React, Radix TooltipTrigger asChild merged no tabIndex onto `<time>`, so timestamps were not focusable. Now every Timestamp becomes a Tab stop: each comment header, each activity line and the documents UI that reuses it. That changes keyboard navigation and tab order through the issue activity feed. → Override it after the spread: `<time {...props} tabindex={undefined} datetime=… class=…>`. The other option is `<TooltipTrigger tabindex={-1}>`. Either way the element is as unfocusable as it was in React. The other TooltipTrigger child uses in this lane are fine: reaction-bar puts it on a button, and collab-avatars already set tabIndex 0 in React.
- [minor] src/lib/components/comments/issue-activity.svelte: Lines 234 and 265: the keyed `{#each items … (c:${comment.id})}` and `{#each item.replies as replyComment (replyComment.id)}` turn a duplicate comment id into a thrown `each_key_duplicate`. Svelte throws this in production too (svelte each.js:357-363). React only warned about the duplicate key and rendered both rows. The ported logic can produce such a duplicate. A timeline refetch, triggered by an unrelated `issue.updatedAt` change or a Retry, can resolve after the server inserted the new comment but before `createComment` returns. Lines 74-77 then keep the server copy plus the `temp-` copy. When `createComment` resolves, line 145 maps temp to `result.comment`, which gives two entries with the same real id. The activity section then crashes instead of briefly showing a duplicate. → Dedupe by id when replacing the temp comment, for example `setComments(issueId, (list) => list.some((c) => c.id === result.comment.id) ? list.filter((c) => c.id !== temp.id) : list.map((c) => (c.id === temp.id ? result.comment : c)))`. Alternatively, drop pending temps whose server copy is already in `result.timeline.comments` when merging on refetch.


### L5 fix report

Both review findings are fixed. The final kit-check over the lane targets reports 0 errors. I only type-checked; nothing was run in a browser.

## Findings

1. **`src/lib/components/comments/timestamp.svelte`: timestamps were Tab stops. Fixed.**
   - I added `tabindex={undefined}` after `{...props}` on `<time>`, which cancels the `tabindex=0` that the bits-ui trigger adds. `<time>` is now unfocusable, as it was under Radix `asChild`.
   - I chose this over `<TooltipTrigger tabindex={-1}>` because `-1` would still let a click or a script focus the element. React's element had no tabindex at all.
   - The tooltip still opens on hover through the bits event handlers in the spread.
   - I left `reaction-bar` and `collab-avatars` alone; the review says they're fine.

2. **`src/lib/components/comments/issue-activity.svelte`: duplicate comment id crashed the keyed `#each`. Fixed.**
   - When `createComment` succeeds, the temp comment is swapped with this:
     ```ts
     setComments(issueId, (list) =>
       list.some((c) => c.id === result.comment.id)
         ? list.filter((c) => c.id !== temp.id)
         : list.map((c) => (c.id === temp.id ? result.comment : c)),
     );
     ```
   - If a refetch has already brought in the server copy, the temp row is dropped instead of becoming a second row with the same id. That covers both `{#each}` blocks, top-level comments and replies, because both read the same list.
   - The other order is already safe. If `createComment` finishes first, the real comment is no longer pending (`isPendingComment` is false), so a later refetch result replaces it rather than adding it again.

## API changes for other lanes
None. Both changes stay inside these two components.

## Final kit-check
```
kit-check: 0 error(s) in src/lib/components/editor src/lib/components/collab src/lib/components/comments src/lib/components/documents src/routes/dashboard/projects/[id]/docs
```

The project's `CLAUDE.md` asks for repo edits to go through a GSD command first. I didn't use one, because this task assigned the edits directly.


---

## L6 build report

I've ported all 24 L6 source files to Svelte, with no TODOs or stubs. The last kit-check run gives **0 errors** in every L6 path, and a separate warning-level svelte-check shows 0 warnings in them. Nothing was run in a browser, so this is type-checked only.

## 1. Source → target mapping
Components live under `/home/oscar/Projects/ticket-system/src/lib/components/`. Routes live under `/home/oscar/Projects/ticket-system/src/routes/dashboard/`.

| Source | Target(s) |
|---|---|
| epics/epic-glyphs.tsx | `epics/epic-icon.svelte`, `epic-status-icon.svelte`, `health-dot.svelte`, `health-chip.svelte`, `progress-ring.svelte`, `milestone-glyph.svelte` |
| epics/epic-progress.tsx | `epics/epic-progress.svelte` (`progressTitle` exported from its `<script module>`), `progress-block.svelte` |
| epics/epic-pickers.tsx | `epics/epic-status-picker.svelte` (+ local `epic-status-options.svelte`), `health-picker.svelte`, `member-picker.svelte`, `date-picker.svelte`, `date-label.svelte`, `color-swatches.svelte`, `epic-picker.svelte` (+ `EpicOption` type), `milestone-picker.svelte`, `initiative-picker.svelte` |
| epics/epic-labels.tsx | `epics/epic-label-chips.svelte`, `epic-label-options.svelte` (+ `EpicLabelOptionsProps`), `epic-label-picker.svelte`, `epic-label-filter.svelte`, `epic-labels-dialog.svelte`; local `epic-label-color-button.svelte`, `epic-label-row-editor.svelte` |
| epics/epic-relations.tsx | `epics/epic-relations.svelte` (the `EpicDependencies` component, + `DependencyCandidate` type); local `add-dependency.svelte` |
| epics/epic-updates.tsx | `epics/epic-updates.svelte`, `update-card.svelte`; local `update-composer.svelte` |
| epics/milestones-section.tsx | `epics/milestones-section.svelte`; local `milestone-item.svelte` |
| epics/epic-detail.tsx | `epics/epic-detail.svelte` (+ `EpicDetailProps`); local `epic-name.svelte`, `epic-description.svelte`, `epic-property-button.svelte` |
| epics/epics-list.tsx | `epics/epics-list.svelte`; local `epic-list-row.svelte` |
| epics/create-epic-dialog.tsx | `epics/create-epic-dialog.svelte`; local `chip-button.svelte` (shared with the initiative dialog) |
| epics/epic-foreign-issues.tsx | `epics/epic-foreign-issues.svelte` |
| epics/rich-text.tsx | `epics/rich-text.svelte`, `rich-text-editor.svelte` |
| epics/foreign-epics-store.ts | `epics/foreign-epics-store.svelte.ts` |
| (new helper) | `epics/optimistic.svelte.ts` (`Optimistic`, `mergePatch`) |
| roadmap/timeline.tsx | `roadmap/timeline.svelte` (`Zoom`, `ZOOMS`, `TimelineItem`, `TimelineDependency` exported from `<script module>`) |
| roadmap/roadmap-view.tsx | `roadmap/roadmap-view.svelte` |
| initiatives/initiative-glyphs.tsx | `initiatives/initiative-status-icon.svelte`, `initiative-status-picker.svelte` (+ local `initiative-status-options.svelte`) |
| initiatives/initiatives-list.tsx | `initiatives/initiatives-list.svelte` |
| initiatives/create-initiative-dialog.tsx | `initiatives/create-initiative-dialog.svelte` |
| initiatives/initiative-detail.tsx | `initiatives/initiative-detail.svelte`; local `add-epic-picker.svelte`, `initiative-name.svelte`, `initiative-description.svelte` |
| app/…/projects/[id]/epics/page.tsx | `projects/[id]/epics/+page.server.ts`, `+page.svelte` |
| app/…/epics/[epicId]/page.tsx | `projects/[id]/epics/[epicId]/+page.server.ts`, `+page.svelte` |
| app/…/projects/[id]/roadmap/page.tsx | `projects/[id]/roadmap/+page.server.ts`, `+page.svelte` |
| app/…/workspaces/[slug]/initiatives/page.tsx | `workspaces/[slug]/initiatives/+page.server.ts`, `+page.svelte` |
| app/…/initiatives/[initiativeId]/page.tsx | `workspaces/[slug]/initiatives/[initiativeId]/+page.server.ts`, `+page.svelte` |

## 2. API decisions other lanes must know
- **Every picker uses L4's `PickerPopoverProps`.** That covers EpicStatus, Health, Member, Date, Epic, Milestone, Initiative, EpicLabel and InitiativeStatus pickers.
  - The trigger is written as `{#snippet children({ props })}<Button {...props}>…{/snippet}`.
  - `open` is `$bindable()`, so callers can use `open` + `onOpenChange` or `bind:open`.
  - All other props keep their React names (`otherProjects`, `loadingOthers`, `placeholder`, `noneLabel`, `clearLabel`, …).
- **`useForeignEpics(projectId, enabled)`** accepts plain values or getters and returns `{ readonly current: ForeignEpicOption[] | undefined }`. It returns `undefined` during SSR. Call it during component init. L4's `property-epic.svelte` already uses it this way.
- **Dialogs** (`CreateEpicDialog`, `EpicLabelsDialog`, `CreateInitiativeDialog`) take `open` + `onOpenChange`, and also accept `bind:open`.
- **`RichText`** takes `source` (not children), matching L5's `Markdown`.
- **`Optimistic`** (`@/lib/components/epics/optimistic.svelte`) reproduces `useOptimistic` + `useTransition`. Optimistic updates are dropped only when every running call has finished, as in React. Other lanes may reuse it.
- **URL state** (`?status`, `?label`, `?tab`, `?project`, `?zoom`) is read and written through W1c's `useSearchParams()` / `setSearchParams`.

## 3. Not ported 1:1, and why
- **`useDraft`** (epic, initiative and label names) is a writable `$derived(name)` instead of L4's `use-draft.svelte.ts`. It has the same "reset when the saved value changes" behaviour.
- **Navigation:**
  - `router.push` → `goto`.
  - `<Button asChild><Link>` → `<Button href>`.
  - `window.history.replaceState` → `setSearchParams` (which uses Kit's `replaceState`).
- **Delete initiative flashes the 404 page.** The generated wrapper refreshes the current page before `goto` runs, so the deleted initiative's load answers 404 for a moment before the list opens. I believe Next re-rendered the not-found state here too, but I haven't confirmed it.
- **404 page titles are lost.** The pages return `error(404)`, so the "Epic not found" / "Workspace not found" / "Initiative not found" titles now depend on `+error.svelte`, which another lane owns.
- **Markup parity:**
  - The ContextMenu row link merges the trigger's `select-none` class, as Radix Slot did.
  - The four a11y warnings that mirror the React markup are silenced with `svelte-ignore`.

## 4. Cross-lane imports and assumed props
All of these exist and type-check.
- **L4:** `issue-pickers` barrel (`PickerPopover`, `keywordFilter`, `digitShortcut`, `PickerPopoverProps`); `issue-detail/property-row.svelte` (`label`, `children`).
- **L5:** `editor` barrel (`Markdown` with `source`/`class`; `MarkdownEditor` with `value`, `onChange`, `onSubmit`, `onCancel`, `placeholder`, `autoFocus`, `maxLength`, `class`, `aria-label`); `documents/epic-documents.svelte` (`projectId`, `epicId`, `documents`).
- **L3a:** `issues/issues-view.svelte` (`issues`, `defaultView`, `createDefaults`); `relativeTime` from `issues/issue-properties`.
- **L1:** `navigation/favorite-button.svelte` (`targetType`, `targetId`).
- **W1:** ui primitives, ui-icons, `project-data.svelte`, `hotkeys.svelte`, `palette-commands.svelte`, `search-params.svelte`, and the `@/lib/actions/{epics,epic-labels,epic-relations,initiatives}` wrappers.

## 5. Coordinator to-dos
- No package, config or env changes are needed.
- **`scripts/kit-check.sh` treats path arguments as regex.** A route path like `[id]` becomes a character class and silently matches nothing. I passed escaped paths (`'src/routes/dashboard/projects/\[id\]/epics'`). Consider escaping inside the script, or using `grep -F`.

## 6. Last kit-check result
```
kit-check: 0 error(s) in src/lib/components/epics src/lib/components/roadmap src/lib/components/initiatives src/routes/dashboard/projects/\[id\]/epics src/routes/dashboard/projects/\[id\]/roadmap src/routes/dashboard/workspaces/\[slug\]/initiatives src/lib/components/issue-detail/slots/property-epic src/lib/components/issues/slots/bulk-bar src/lib/components/customers/customer src/lib/components/documents/document-view src/lib/components/dashboards/widget-body src/lib/components/dashboards/pulse-feed
```
That run also covered the other lanes' files that import my components. There were no "Cannot find module" errors.


### L6 review

- [major] src/routes/dashboard/projects/[id]/epics/[epicId]/+page.svelte: Moving from one epic to another reuses the same EpicDetail component. Next's App Router keys each page segment by its params, so going from /epics/A to /epics/B remounted EpicDetail and cleared its state. SvelteKit keeps the instance on a param change, and +page.svelte:12-24 renders <EpicDetail> without a {#key}. State that survives the switch includes:
- epic-description.svelte:21-23 (`editing`, `draft`)
- milestones-section.svelte:60-61 (`adding`, `draft`)
- the Optimistic ops of epic-detail, epic-relations, epic-updates and milestones-section, which are applied on top of B's server data until A's transition settles
- add-dependency `kind`
- update-composer `health` and `body`
Concrete failure: on epic A, click Edit on the description and type. Then click a dependency link in the Dependencies section, which is on the same Overview tab, to open epic B. B opens with A's draft still in the editor, and Save calls onSave(draftA), writing A's text into B's description. The favorites sidebar and the palette lead to the same thing. Other lanes key their detail pages: docs/[docId]/+page.svelte:13 `{#key data.document.id}`, views/[viewId], dashboards/[dashboardId], and the project layout `{#key project.id}`. → Wrap the component in a key: `{#key data.epic.id}<EpicDetail … />{/key}` in src/routes/dashboard/projects/[id]/epics/[epicId]/+page.svelte.
- [major] src/routes/dashboard/workspaces/[slug]/initiatives/[initiativeId]/+page.svelte: Same problem as the epic page: lines 12-17 render <InitiativeDetail> without a {#key}. When the viewer moves from initiative A to initiative B (sidebar favorites, palette, or another workspace), the component is reused instead of remounted as it was in Next. The kept state includes:
- initiative-description.svelte:485-487 (`editing`, `draft`)
- initiative-detail.svelte:91-92 (`zoom`, `confirmDelete`)
- the pending ops of both Optimistic instances
An open description editor carries A's draft over to B, and Save writes it into B. Workspace-level navigation between initiative lists (workspaces/[slug]/initiatives) also keeps `creating`, because no workspace layout is keyed. That case is minor. → Use `{#key data.detail.initiative.id}<InitiativeDetail … />{/key}`. Optionally also key the list page with `{#key data.workspace.id}`.
- [minor] src/routes/dashboard/projects/[id]/epics/[epicId]/+page.server.ts: The 404 titles are lost. Next's generateMetadata set 'Epic not found', 'Workspace not found' (initiatives list) and 'Initiative not found'. Now the loads throw error(404, 'Not found') at epics/[epicId]/+page.server.ts:30, initiatives/+page.server.ts:17 and initiatives/[initiativeId]/+page.server.ts:22, and no title is set for the error case. The tab then reads '<project name> · Ticket System' (from the project layout) or 'Ticket System'. The builder disclosed this. → Throw error(404, 'Epic not found'), error(404, 'Workspace not found') and error(404, 'Initiative not found'). Ask the owner of the +error.svelte files to render `<svelte:head><title>{page.error?.message} · Ticket System</title></svelte:head>` when the status is 404.


### L6 fix report

I fixed all three findings, and the final kit-check shows 0 errors in L6's paths. Nothing was run in a browser, so this is type-checked only.

## Findings

1. **Epic detail page was reused across epics (major): fixed.** In `/home/oscar/Projects/ticket-system/src/routes/dashboard/projects/[id]/epics/[epicId]/+page.svelte`, `<EpicDetail>` is now wrapped in `{#key data.epic.id}…{/key}`. Going from one epic to another remounts the component, as it did in Next. Description and milestone drafts, the composer and add-dependency state, and pending Optimistic ops no longer carry over. The epics list and roadmap pages don't need a key: their state is per project, and the project layout already keys on `project.id`.

2. **Initiative detail page was reused across initiatives (major): fixed.** In `/home/oscar/Projects/ticket-system/src/routes/dashboard/workspaces/[slug]/initiatives/[initiativeId]/+page.svelte`, `<InitiativeDetail>` is now wrapped in `{#key data.detail.initiative.id}…{/key}`. I also took the optional fix: in `/home/oscar/Projects/ticket-system/src/routes/dashboard/workspaces/[slug]/initiatives/+page.svelte`, `<InitiativesList>` is wrapped in `{#key data.workspace.id}…{/key}`, so `creating` resets when you switch workspaces.

3. **404 titles were lost (minor): fixed on L6's side.** The loads now throw the titles Next's `generateMetadata` used:
   - `epics/[epicId]/+page.server.ts`: `error(404, 'Epic not found')`
   - `initiatives/+page.server.ts`: `error(404, 'Workspace not found')`
   - `initiatives/[initiativeId]/+page.server.ts`: `error(404, 'Initiative not found')`

   This goes against PLAN.md's convention that `notFound()` becomes `error(404, 'Not found')`, but nothing reads `page.error.message`, so changing it is safe. The message still doesn't say whether the item is missing or belongs to someone else.

   The browser tab title only changes once the error-page owners render the message, because the `+error.svelte` files belong to other lanes.

## For the coordinator / other lanes
- **Owner of `src/routes/dashboard/projects/[id]/+error.svelte`:** it sets no title today, so an epic 404 shows the project layout's title. For 404s, please render `<svelte:head><title>{page.error?.message} · Ticket System</title></svelte:head>` when the message isn't the generic `'Not found'`.
- **Owner of `src/routes/dashboard/+error.svelte`:** initiative 404s land here. It always sets `404: This page could not be found.` for a 404, so it needs the same message-based title change.
- **No API changes:** no component props or exports changed.

## Final kit-check
```
kit-check: 0 error(s) in src/lib/components/epics src/lib/components/roadmap src/lib/components/initiatives src/routes/dashboard/projects/\[id\]/epics src/routes/dashboard/projects/\[id\]/roadmap src/routes/dashboard/workspaces/\[slug\]/initiatives
```


---

## L7 build report

# L7 report: Cycles, triage, inbox, recurring, productivity

All 40 source files are ported. Nothing is left as a TODO, stub or simplified version. The last `scripts/kit-check.sh` over every target path reports **0 errors**. A separate full `svelte-check --threshold warning` run (7652 files) shows no errors or warnings in my files. I only type-checked; nothing has been run in a browser.

One cross-lane bug needs fixing: L1's topbar imports the wrong copy of the new-issue bus (see section 5, item 1).

## 1. Source → target mapping

Components are in `/home/oscar/Projects/ticket-system/src/lib/components/<dir>/`.

**cycles/**

| Source | Target(s) |
|---|---|
| `cycle-stats.tsx` | `cycle-stats.svelte`, `cycle-progress-bar.svelte`, `cycle-glyph.svelte` |
| `cycle-capacity.tsx` | `capacity-meter.svelte`, `capacity-badge.svelte`, `cycle-capacity.ts` (shared helpers) |
| `cycle-charts.tsx` | `unit-toggle.svelte`, `burndown-chart.svelte`, `velocity-chart.svelte` (exports `VelocityCycle`), `chart-card.svelte` (local) |
| `cycle-dialogs.tsx` | `cycle-form-dialog.svelte` (exports `EditableCycle`), `complete-cycle-dialog.svelte`, `cycle-form.svelte` (local) |
| `cycle-picker.tsx` | `cycle-picker.svelte`, `cycle-options.svelte` (exports `CycleOptionsProps`) |
| `cycles-list.tsx` | `cycles-list.svelte` (exports `CycleListItem`) |
| `cycle-header.tsx`, `cycle-breakdown.tsx`, `feature-off.tsx`, `automation-settings-form.tsx` | same name, `.svelte` |
| `planning-settings-form.tsx` | `planning-settings-form.svelte` (exports `PlanningSettings`) |

**inbox/**

| Source | Target(s) |
|---|---|
| `inbox-view.tsx`, `inbox-detail.tsx`, `when-picker.tsx`, `inbox-badge-count.tsx` | same name, `.svelte` |
| `inbox-groups.ts` | `inbox-groups.ts` (identical copy) |
| `notification-glyph.tsx` | `notification-glyph.svelte` (`notificationSentence` exported from its module script) |
| `notification-prefs-form.tsx` | `notification-prefs-form.svelte`, `switch-row.svelte` |

**productivity/**

| Source | Target(s) |
|---|---|
| `drafts-list.tsx` | `drafts-list.svelte` (exports `DraftListItem`) |
| `issue-actions.ts` | `issue-actions.ts` (uses svelte-sonner) |
| `issue-command-dialog.tsx` | `issue-command-dialog.svelte` (exports `IssueCommand`) |
| `property-chips.tsx`, `template-menu.tsx` | same name, `.svelte` |
| `template-settings.tsx` | `template-settings.svelte`, `template-row.svelte` and `template-editor.svelte` (local) |
| `templates-store.ts` | `templates-store.svelte.ts` |
| `use-draft-autosave.ts` | `use-draft-autosave.svelte.ts` |
| (new) | `new-issue-bus.svelte.ts` (see section 3) |

**recurring/**

| Source | Target(s) |
|---|---|
| `recurring-settings.tsx` | `recurring-settings.svelte`, `recurring-row.svelte`, `recurring-editor.svelte`, `recurring-defaults.ts` (`defaultsToPatch`) |

**triage/**

| Source | Target(s) |
|---|---|
| `triage-dialogs.tsx` | `accept-dialog.svelte` (exports `AcceptChoice`), `decline-dialog.svelte`, `duplicate-dialog.svelte`, `accept-form.svelte` (local) |
| `triage-suggestions.tsx`, `triage-view.tsx` | same name, `.svelte` |

**Routes.** Each gets a `+page.server.ts` plus `+page.svelte`, with the same session redirect (303), 404s, permission checks and `<svelte:head>` titles. All are under `/home/oscar/Projects/ticket-system/src/routes/dashboard/`:
- `drafts/`, `inbox/`, `templates/`
- `projects/[id]/cycles/`, `projects/[id]/cycles/[cycleId]/`
- `projects/[id]/triage/`, `projects/[id]/settings/recurring/`

The three `loading.tsx` files get no route file, as the plan says (L1's progress indicator covers them).

## 2. API decisions other lanes must know
- **Hooks return objects with getters, not tuples.**
  - `useTemplates(projectId | () => id, enabled | () => bool)` returns `{ current }`. `current` is `undefined` while loading.
  - `useDraftAutosave(projectId | getter, enabled | getter)` returns `status` as a getter, plus the same `schedule`, `flush`, `cancel`, `discard` and `reset` methods.
  - `setCachedTemplates` and `templateProps` are unchanged.
- **New-issue bus:** import it from `@/lib/components/productivity/new-issue-bus.svelte`. It has the same exports, plus a reactive `issueCreator.current`, which replaces `useSyncExternalStore(subscribeIssueCreator, hasIssueCreator)`. Hosts and callers must all use this module, or they won't see each other.
- **Props that changed shape:**
  - `CyclePicker` takes `PickerPopoverProps` (trigger = `children({ props })`) plus `value` and `onChange`, and `bind:open`.
  - `FeatureOffState` takes `icon` as a Snippet.
  - `NotificationPrefsForm` takes `pushSection` as a Snippet.
  - `SwitchRow` props are as in React, with `class`. `push-settings.svelte` already uses it correctly.
- **Dialogs:** `CycleFormDialog`, `CompleteCycleDialog`, `AcceptDialog`, `DeclineDialog` and `DuplicateDialog` accept `open` + `onOpenChange` or `bind:open`.

## 3. Not ported 1:1, and why
- **`new-issue-bus.ts` is copied, not imported as is.** The original registers `c` in the React hotkey registry (`@/lib/hotkeys`). That adds a second keydown listener with the Radix layer test, and `c` would be missing from the `?` overlay. This is the deviation W1c flagged. The original file is untouched.
- **`suppressHydrationWarning` is dropped.** Svelte keeps the server's text on hydration, which matches React's behaviour with that flag.
- **Strict control:** where React kept a control still until the parent agreed (ToggleGroups, Switches, Selects, dialog `open`), I used function bindings (`bind:x={() => v, set}`).
- **Number inputs** in the recurring editor use a one-way `value` plus `oninput`, so they keep React's string values; `bind:value` would turn them into numbers.
- **`useOptimistic` in the drafts list:** ops stay applied until every running call has settled, matching React's entangled transitions.
- **Unchanged behaviour:** the inbox, the triage `pending` flag and every toast, permission check, hotkey (j/k/Enter/u/e, 1/2/3/a, `c`), aria attribute and empty state.

## 4. Cross-lane imports I rely on
All of these exist now and type-check against my usage.

| Lane | Import | Props / members used |
|---|---|---|
| L4 | `issue-pickers` (index barrel, `picker-popover.svelte`, `picker-utils`) | Pickers take a trigger `children({ props })` and a `content` snippet; also `keywordFilter` |
| L4 | `issue-detail/issue-detail-pane.svelte` | `issue`, `mutations`, `onClose` |
| L4 | `issue-detail/use-is-desktop.svelte` | `useIsDesktop` |
| L3a | `issues/issue-properties` | `relativeTime` |
| L3a | `issues/label-chips.svelte` | `labels`, `max`, `class` |
| L3a | `issues/issues-view.svelte` | `issues`, `defaultView`, `createDefaults` |
| L5 | `editor/markdown.svelte` | `source` (React's `children`), `projectId`, `ticketKey`, `class` |
| L1 | `navigation/favorite-button.svelte` | `targetType`, `targetId` |
| L8 | `settings/field.svelte` | `hint` takes a string |
| L8 | `project-templates/templates-manager.svelte` | `templates`, `projects`, `workspaces` |
| L9b | `charts/line-chart.svelte`, `charts/bar-chart.svelte` | Same props as React |
| W1c | `use-issue-mutations`, `project-data`, `hotkeys`, `palette-commands`, `refresh` | — |

There are no "Cannot find module" errors.

## 5. For the coordinator
1. **Bug in L1, which I can't fix:** `src/lib/components/topbar-chrome.svelte:45` imports `hasIssueCreator` and `subscribeIssueCreator` from `@/components/productivity/new-issue-bus` (the React-free original). L3a's `new-issue-dialog.svelte` and `issue-shortcuts.svelte` register with my Svelte copy. Because these are two separate module instances, the topbar never sees the hosts and fires its own `c` as well. Fix: import from `@/lib/components/productivity/new-issue-bus.svelte` and use `issueCreator.current`.
2. The planning, automations and templates settings pages (L8) and notifications settings (L9a) should import `planning-settings-form.svelte`, `automation-settings-form.svelte`, `template-settings.svelte` and `notification-prefs-form.svelte` from my folders.
3. No package, config or env changes are needed. The recurring page still reads `process.env.CRON_SECRET` on the server, so it relies on the vite config loading `.env` into `process.env`, which the plan says it already does.
4. I didn't follow the project CLAUDE.md's GSD-workflow rule, because your global extension policy forbids optional skills.

## 6. Last kit-check
```
kit-check: 0 error(s) in src/lib/components/cycles src/lib/components/inbox src/lib/components/productivity src/lib/components/recurring src/lib/components/triage src/routes/dashboard/drafts src/routes/dashboard/inbox src/routes/dashboard/templates src/routes/dashboard/projects/\[id\]/cycles src/routes/dashboard/projects/\[id\]/triage src/routes/dashboard/projects/\[id\]/settings/recurring
```


### L7 review

- [minor] src/lib/components/topbar-chrome.svelte: Cross-lane, owned by L1. The builder already reported it and I confirmed it. Line 45 imports hasIssueCreator and subscribeIssueCreator from '@/components/productivity/new-issue-bus', the React-free original. Every Svelte host registers with the L7 copy instead: L3a's new-issue-dialog.svelte:16 and issue-shortcuts.svelte:28. The topbar's $effect (~line 177, `if (projectId && issueCreator) return;`) therefore never sees a host. On any project page that has a new-issue dialog, `c` fires twice: the bus opens the dialog, and the topbar also runs goto(`${projectHref(projectId)}?create=1`). React's topbar stepped aside through useSyncExternalStore on the same module. The impact is user-visible, but L7 cannot edit this file, so it is not counted against this lane's verdict. → In topbar-chrome.svelte, import CREATE_PARAM and the reactive `issueCreator` from '@/lib/components/productivity/new-issue-bus.svelte'. Replace the local createSubscriber over hasIssueCreator/subscribeIssueCreator with `issueCreator.current` inside the $effect.


### L7 fix report

# L7 review fixes

No files were changed in this pass. The only finding is in a file another lane owns.

## Findings

1. **`src/lib/components/topbar-chrome.svelte`: skipped. The bug is real, but the file belongs to L1.**
   - `lanes.json` gives `src/components/topbar-chrome.tsx` to L1, and the task says to touch only this lane's targets.
   - The bug is still there:
     - Lines 43-45 import `hasIssueCreator` and `subscribeIssueCreator` from `@/components/productivity/new-issue-bus`.
     - Lines 77-81 wrap those imports in a local `createSubscriber`.
     - The `$effect` at line 178 uses that wrapper, so it never sees the hosts registered with L7's Svelte bus, and `c` fires twice on project pages.
   - L7's side of the fix is ready. `/home/oscar/Projects/ticket-system/src/lib/components/productivity/new-issue-bus.svelte.ts` exports the reactive `issueCreator` (line 92) and `CREATE_PARAM` (line 100), plus `hasIssueCreator`, `subscribeIssueCreator`, `requestNewIssue`, `registerNewIssueHost`, `DRAFT_PARAM` and `TEMPLATE_PARAM`.
   - **Fix for L1:**
     - Import `{ CREATE_PARAM, issueCreator }` from `@/lib/components/productivity/new-issue-bus.svelte`.
     - Delete the `createSubscriber` and `$derived` block at lines 77-81.
     - In the `$effect`, use `if (projectId && issueCreator.current) return;`.

## API changes other lanes must know

None in this pass. The rule from the builder's report still holds: every new-issue host and caller must import `@/lib/components/productivity/new-issue-bus.svelte`, not the React original. Otherwise they end up on separate module instances and can't see each other.

## Final kit-check

```
kit-check: 0 error(s) in src/lib/components/cycles src/lib/components/inbox src/lib/components/productivity src/lib/components/recurring src/lib/components/triage src/routes/dashboard/drafts src/routes/dashboard/inbox src/routes/dashboard/templates src/routes/dashboard/projects/[id]/cycles src/routes/dashboard/projects/[id]/triage src/routes/dashboard/projects/[id]/settings/recurring
```


---

## L8 build report

All 43 source files are ported; the only two with no Svelte target are the `loading.tsx` files, which PLAN.md says to drop. The last `scripts/kit-check.sh` run over my paths gave 0 errors, and a warning-level svelte-check shows 0 warnings in my files. Nothing has been run in a browser.

## (1) Source → target mapping

Target roots: `$C` = `src/lib/components`, `$R` = `src/routes/dashboard/projects/[id]/settings`.

**Routes.** Each `page.tsx` becomes `+page.server.ts` and `+page.svelte` under `$R/<seg>/`.
- Segments covered: `audit`, `automations`, `developer`, `general`, `github`, `import-export`, `intake`, `integrations`, `labels`, `members`, `planning`, `sla`, `templates`, `workflow`.
- The index `page.tsx` becomes `$R/+page.server.ts`, which redirects with 303 to `settings/general`, plus an empty `+page.svelte`.
- `members/loading.tsx` and `workflow/loading.tsx` have no target, per PLAN ("loading.tsx → nothing").

**settings/** (`$C/settings/`)
- `field.tsx` → `field.svelte`.
- `appearance-form.tsx` → `appearance-form.svelte`.
- `password-form.tsx` → `password-form.svelte`.
- `profile-form.tsx` → `profile-form.svelte`, which exports the `ProfileFormProps` interface.
- `timezone-picker.tsx` → `timezone-picker.svelte`.
- `project-general-form.tsx` → `project-general-form.svelte` plus local parts: `project-details-form`, `project-key-form`, `project-danger-zone`, `project-team-structure`, `project-parent-form`, `project-visibility-form`, `project-save-as-template`. It exports `ProjectGeneralFormProps`.
- `labels/labels-settings.tsx` → `labels/labels-settings.svelte` plus `label-row`, `label-editor`, `delete-label-dialog` and `label-utils.ts`.
- `workflow/color-picker.tsx` → `workflow/color-picker.svelte`, which exports `PRESET_COLORS` from its module script.
- `workflow/workflow-settings.tsx` → `workflow/workflow-settings.svelte` plus `state-row`, `state-editor`, `delete-state-dialog` and `workflow-utils.ts`.
- New helpers I added:
  - `action-state.svelte.ts` (`createActionState`, `useResultToast`).
  - `callout.svelte` (shared warning/error callout).
  - `section-heading.svelte`.

**github/** (`$C/github/`)
- `github-mark.tsx` → `github-mark.svelte`.
- `use-github-viewer.ts` → `use-github-viewer.svelte.ts`.
- `repo-picker.tsx` → `repo-picker.svelte`.
- `github-settings.tsx` → `github-settings.svelte` plus `github-account-section`, `github-repository-section`, `github-automation-section`, `github-state-select` and `use-webhook-health.svelte.ts`.

**developer/** (`$C/developer/`)
- `provider-marks.tsx` → `gitlab-mark.svelte`, `bitbucket-mark.svelte`, `sentry-mark.svelte`, `vcs-mark.svelte`, and a `provider-marks.ts` barrel under the React names.
- `use-vcs-connections.ts` → `use-vcs-connections.svelte.ts`.
- `developer-settings.tsx` → `developer-settings.svelte`, which exports `VcsIntegrationView`, `SentryIntegrationView` and `DeveloperSettingsProps`. Local parts: `vcs-section`, `vcs-connect-form`, `sentry-section`, `sentry-form`, `copy-field`, `disconnect-button`.

**import/** (`$C/import/`)
- `import-runner.tsx` → `import-runner.svelte.ts` (`useImportRunner`, `ImportSummary`), `import-progress.svelte`, `import-result.svelte`, `record-preview.svelte`.
- `external-import.tsx` → `token-form.svelte`, `include-completed.svelte`, `fetched-preview.svelte`.
- `csv-import`, `github-import`, `asana-import`, `shortcut-import`, `import-export-panel` → same names with `.svelte`.

**project-templates/** (`$C/project-templates/`)
- `template-select.tsx` → `template-select.svelte` plus `template-select.svelte.ts`. The module script of the `.svelte` file re-exports `useProjectTemplates` and `invalidateProjectTemplates`.
- `template-dialog.tsx` → `template-dialog.svelte` plus `template-form.svelte`. It exports `TemplateSourceProject` and `TemplateWorkspaceOption`.
- `templates-manager.tsx` → `templates-manager.svelte` plus `delete-template-dialog.svelte`.

## (2) API decisions other lanes must know

- **Rune-style hooks return `{ readonly current }`** and take the project id as a string or a getter. Call them during component init, never destructure the result.
  - `useGithubViewer(projectId | () => string)`
  - `useVcsConnections(projectId | () => string)`
  - `useProjectTemplates(enabled | () => boolean)`
  - `useImportRunner(projectId | () => string)` returns `{ run, progress, summary, reset }`.
  - `loadGithubViewer(projectId)` is unchanged.
- **Templates:** `TemplateDialog` takes `open` as `$bindable` plus `onOpenChange`. Its other props are unchanged: `template`, `projects`, `fixedProject`, `workspaces`, `defaultWorkspaceId`, `onSaved`.
- **`TemplateSelect`:** same props as React (`id`, `templates`, `value`, `onChange`).
- **`Field`:** `hint` is `string | Snippet` and `error` is a string. Other lanes already import it.
- **`SectionHeading`:** `description` is `string | Snippet`; the optional `icon` is a snippet.
- **`ColorPicker`:** props `value`, `onChange`, `label`, `disabled`. `PRESET_COLORS` is a named export of `color-picker.svelte`.
- **Page data contracts:** the field names are in each `+page.server.ts` `load`. Dates are pre-formatted in the intake load and ISO strings are used elsewhere, so nothing depends on client time zone.

## (3) Not ported 1:1, and why

- **`loading.tsx` ×2:** dropped, per PLAN.
- **`router.refresh()` in `profile-form` and `templates-manager`:** not repeated. The `updateProfile` and project-template wrappers are generated with refresh `true`, so a second refresh would be redundant.
- **`<form action={formAction}>`:** now `onsubmit` with `createActionState`. React 19 reset the uncontrolled fields after every action; I don't, so typed values survive a validation error. On success the refreshed props re-seed the inputs.
- **Rich Select triggers:** React showed the selected item's content (mono key plus name, `StateIcon` plus name). I reproduce these with `SelectValue` children snippets, and I pass `items` to every Select as W1b requires. This applies to parent team, replacement state, GitHub PR state, template project and template workspace.
- **Controlled Selects and Switches** use function bindings (`bind:value={() => v, onChange}`) so a rejected value doesn't stick.
- **React's `useActionState` and `useTransition`** become `$state` pending flags. Dialog handlers capture the target before awaiting, because AlertDialogAction closes the dialog right after `onclick` and the prop would be `null` by then.
- **Hex input in `ColorPicker`:** React's synthetic submit also bubbled from the portaled hex form into the label or state editor's `onSubmit`. Svelte events don't bubble through the portal, so that accidental double-handling is gone.
- **`GithubSettings` and `DeveloperSettings`:** the JSX hint text, `VCS_COPY` and `Callout` children became snippets and a shared `Callout` component.
- **Icons:** lucide `Loader2` is `loader-circle`, `AlertTriangle` is `triangle-alert`, `MoreHorizontal` is `ellipsis`, `CheckCircle2` is `circle-check`. These are the same glyphs.

## (4) Cross-lane imports I rely on

- **L9a**
  - `audit/audit-log-view.svelte` with prop `data`, and `audit/audit-log-view.server.ts` `loadAuditLogView(scope, searchParams, basePath)`.
  - `integrations/{intake-settings,slack-settings,webhook-settings}.svelte`, assuming the React props. `webhook-settings` takes `{ projectId, webhooks }`, with dates as ISO strings.
- **L2:** `invite-panel.svelte` (`projectId`, `inviteUrl`, `pending`) and `member-list.svelte` (`members`, `currentUserId`, `projectId`), both directly under `$C/`.
- **L3a:** `sla/sla-settings-form.svelte` (`projectId`, `initial`, `canEdit`) and `issues/issue-properties` (`relativeTime`).
- **L4:** `issue-pickers/picker-utils` (`keywordFilter`).
- **L7:** `cycles/{automation,planning}-settings-form.svelte` and `productivity/template-settings.svelte` (`projectId`, `templates`, `canEdit`).
- **L1:** the settings `+layout` and `projectHref`, which is imported as-is from `@/components/app-shell/routes`.
- **W1c:** `project/project-data.svelte` (`useProjectData`) and `svelte/theme.svelte` (`useTheme`).
- **Shared, unchanged:** the generated `@/lib/actions/*` wrappers, `$app/state`, `svelte-sonner`.

## (5) Things the coordinator must do

- **Nothing for packages or env.** `members/+page.server.ts` still reads `process.env.NEXT_PUBLIC_APP_URL`, which the Vite config inlines.
- **For L1 (or the coordinator):** a navigation progress indicator replaces the two dropped `loading.tsx` files.

## (6) Last kit-check result

```
kit-check: 0 error(s) in src/lib/components/settings src/lib/components/project-templates src/lib/components/import src/lib/components/developer src/lib/components/github src/routes/dashboard/projects/\[id\]/settings
```


### L8 review

- [minor] src/lib/components/import/asana-import.svelte: `pending` is one boolean that each `transition()` call sets to false when it finishes, so nested or overlapping calls clear it too early. In `connect` (line 75), when the token gives exactly one workspace, `loadProjects` starts its own transition from inside the outer one. The inner call sets `pending = true`, then the outer call's `finally` sets it back to false while the project list is still loading. React's `useTransition` keeps `isPending` true until every action started through it has finished. So in React, the workspace Select, the Include completed switch and the Fetch tasks spinner stay disabled or spinning during that auto-load. In the port they are enabled and show no spinner. → Count in-flight transitions (`let inFlight = $state(0); const pending = $derived(inFlight > 0)`, increment before the await and decrement in `finally`). Alternatively, `await loadProjects(...)` inside `connect` instead of `void`-ing it. Apply the same counter in shortcut-import.svelte so the two files stay consistent.
- [minor] src/lib/components/settings/labels/labels-settings.svelte: Lines 83-90 always pass an `action` snippet to EmptyState and only check `canEdit` inside it. EmptyState renders `<div class="mt-1">{@render action()}</div>` whenever `action` is defined (ui-icons/empty-state.svelte). So a guest who sees the 'No labels yet' state gets an empty div that adds gap-3 plus mt-1 of extra space under the description. React passed `action={canEdit ? <Button…/> : undefined}`, which rendered no wrapper. This breaks pixel parity. → Pass the snippet only when the user can edit, for example define `{#snippet newLabelAction()}…{/snippet}` and pass `action={canEdit ? newLabelAction : undefined}`. Another option is to wrap the whole EmptyState in two branches.


### L8 fix report

Both findings are fixed. `scripts/kit-check.sh` reports 0 errors on all L8 paths. I did not run anything in a browser.

**1. Overlapping `transition()` calls clear `pending` too early (`asana-import.svelte`, `shortcut-import.svelte`): fixed.**
- `pending` is now `const pending = $derived(inFlight > 0)`, backed by `let inFlight = $state(0)`.
- `transition()` increments `inFlight` before the await and decrements it in `finally`.
- In `asana-import.svelte`, the nested `loadProjects` call from `connect` therefore keeps the workspace Select, Include completed switch and Fetch tasks spinner disabled or spinning until the project list has loaded.
- I applied the same counter to `shortcut-import.svelte` so the two files stay consistent.

**2. `EmptyState` renders an empty `action` wrapper for guests (`labels-settings.svelte`): fixed.**
- The "New label" button is now a `newLabelAction` snippet, defined outside the `EmptyState`.
- It is passed as `action={canEdit ? newLabelAction : undefined}`, so guests get no `mt-1` wrapper and no extra gap.

**API changes for other lanes:** none.

**Files changed:**
- `/home/oscar/Projects/ticket-system/src/lib/components/import/asana-import.svelte`
- `/home/oscar/Projects/ticket-system/src/lib/components/import/shortcut-import.svelte`
- `/home/oscar/Projects/ticket-system/src/lib/components/settings/labels/labels-settings.svelte`

**Final kit-check result:**
```
kit-check: 0 error(s) in src/lib/components/settings src/lib/components/project-templates src/lib/components/import src/lib/components/developer src/lib/components/github src/routes/dashboard/projects/[id]/settings
```


---

## L9a build report

# L9a report: Workspaces, customers, integrations, Slack, audit, user settings

All 30 source files are ported except `workspaces/[slug]/loading.tsx`, which PLAN.md says not to port (see §3). There are no TODOs or stubs. The last `scripts/kit-check.sh` run over all my paths shows **0 errors**. A full unfiltered run shows 1 error in the whole repo, and it is not in my files. Every cross-lane module I import exists now and type-checks against my usage, so there are no "Cannot find module" errors. Nothing has been run in a browser.

## 1. Source → target mapping

Components are under `/home/oscar/Projects/ticket-system/src/lib/components/`. Routes are under `/home/oscar/Projects/ticket-system/src/routes/dashboard/`.

| Source | Target(s) |
|---|---|
| audit/audit-log-view.tsx (async server component) | `audit/audit-log-view.svelte` + `audit/audit-log-view.server.ts` (`loadAuditLogView`) |
| audit/audit-filter-bar.tsx | `audit/audit-filter-bar.svelte` (`AuditActorOption` type in `<script module>`) |
| customers/customer-glyphs.tsx | `customers/customer-logo.svelte`, `customer-status-chip.svelte`, `importance-icon.svelte`, `request-source-icon.svelte`; `STATUS_DOT_CLASS` → `customers/customer-glyphs.ts` |
| customers/customer-dialog.tsx | `customers/customer-dialog.svelte`, `delete-customer-dialog.svelte`, local `customer-form.svelte` |
| customers/customers-list.tsx | `customers/customers-list.svelte`, local `customer-list-item.svelte` |
| customers/customer-detail.tsx | `customers/customer-detail.svelte`, local `customer-notes.svelte`, `requests-timeline.svelte` |
| integrations/copy-field.tsx | `integrations/copy-field.svelte` |
| integrations/api-key-settings.tsx | `integrations/api-key-settings.svelte`, local `create-key-dialog.svelte` |
| integrations/intake-form.tsx | `integrations/intake-form.svelte`, local `intake-form-body.svelte` |
| integrations/intake-settings.tsx | `integrations/intake-settings.svelte` |
| integrations/slack-settings.tsx | `integrations/slack-settings.svelte` |
| integrations/webhook-settings.tsx | `integrations/webhook-settings.svelte`, local `webhook-dialog.svelte`, `webhook-deliveries.svelte` |
| slack/slack-app-settings.tsx | `slack/slack-app-settings.svelte`, local `slack-workspace-row.svelte`, `slack-link-row.svelte`, `slack-setup-guide.svelte` |
| workspaces/permissions.ts | `workspaces/permissions.svelte.ts` |
| workspaces/accept-workspace-invite.tsx | `workspaces/accept-workspace-invite.svelte` |
| workspaces/create-workspace-dialog.tsx | `workspaces/create-workspace-dialog.svelte`, `create-workspace-trigger.svelte` |
| workspaces/workspace-actions.tsx | `workspaces/workspace-actions.svelte` |
| workspaces/workspace-members.tsx | `workspaces/workspace-members.svelte`, local `workspace-member-row.svelte`, `workspace-invitation-row.svelte`, `workspace-invite-dialog.svelte`, `workspace-invites.ts` |
| workspaces/workspace-projects.tsx | `workspaces/workspace-projects.svelte` (`WorkspaceTeamRow` type in module script), local `workspace-project-row.svelte`, `workspace-add-project-dialog.svelte`, `workspace-create-project-dialog.svelte` |
| projects/[id]/customers/page.tsx | `projects/[id]/customers/+page.server.ts`, `+page.svelte` |
| projects/[id]/customers/[customerId]/page.tsx | `projects/[id]/customers/[customerId]/+page.server.ts`, `+page.svelte` |
| projects/[id]/members/page.tsx | `projects/[id]/members/+page.server.ts` (redirect only) |
| settings/page.tsx | `settings/+page.server.ts` (redirect only) |
| settings/appearance/page.tsx | `settings/appearance/+page.svelte` |
| settings/notifications/page.tsx | `settings/notifications/+page.server.ts`, `+page.svelte` |
| settings/profile/page.tsx | `settings/profile/+page.server.ts`, `+page.svelte` |
| settings/slack/page.tsx | `settings/slack/+page.server.ts`, `+page.svelte` |
| workspaces/[slug]/page.tsx | `workspaces/[slug]/+page.server.ts`, `+page.svelte` |
| workspaces/[slug]/audit/page.tsx | `workspaces/[slug]/audit/+page.server.ts`, `+page.svelte` |
| workspaces/[slug]/loading.tsx | not ported (see §3) |

## 2. API decisions other lanes must know

- **Audit log (L8, project audit page):**
  - In `+page.server.ts`: `loadAuditLogView(scope, url.searchParams, basePath)`. The query argument may also be a Next-style record.
  - In the page: `<AuditLogView data={…} />`. This replaces the React props `scope`, `query`, `basePath`.
  - The rows carry only the fields the table shows; the event `data` payload is not sent to the browser.
  - L8's audit page already uses it this way.
- **`useProjectPermissions()`** returns the same `ProjectPermissions` type, but as a live view: each field reads the current project role. Read fields off it; destructuring takes a one-time snapshot. `projectPermissions(role)` is unchanged.
- **`CreateWorkspaceTrigger`** is `workspaces/create-workspace-trigger.svelte` with prop `variant`.
- **`CreateWorkspaceDialog`** and **`CustomerDialog`** accept `open` + `onOpenChange`, or `bind:open`.
- **Customer glyphs (L4):** `CustomerLogo`, `ImportanceIcon` and `RequestSourceIcon` keep their React props, with `className` → `class`.
- **`CopyField`, `IntakeForm`, `IntakeSettings`, `SlackSettings`, `WebhookSettings`, `ApiKeySettings`, `AcceptWorkspaceInvite`, `SlackAppSettings`** keep their React props.
- **Types** `SlackWorkspace`, `SlackAdminProject` and `SlackAppUrls` are exported from `slack/slack-app-settings.svelte`.

## 3. Not ported 1:1, and why

- **`workspaces/[slug]/loading.tsx`:** not ported. PLAN.md says `loading.tsx` becomes nothing per page; the dashboard layout's navigation indicator replaces it.
- **Redirecting actions:** after an action that redirects (leave or delete workspace, accept invite), the generated wrapper navigates and resolves `undefined`. Every result is therefore checked for `undefined` before reading `.ok`; without that check React's code would throw.
- **Customers list filters** (`?status`, `tier`, `sort`, `dir`) go through `setSearchParams`/`useSearchParams` from `@/lib/svelte/search-params.svelte`, replacing the direct `history.replaceState`.
- **Audit filter bar** navigates with `goto(…, { replace: true, reset: false })` and shows a pending spinner while it runs, as React's transition did.
- **Optimistic customer edits:** `useOptimistic` became a writable `$derived` that is reset to the server value when a save fails.
- **Controls that must stay on the server value until it changes** (intake switch, webhook switch, member role select, status toggle group, delete dialogs) use function bindings, as W1b recommended.
- **Intake form reset:** React 19 resets a `<form action>` after the action runs. The port reproduces this with `defaultValue` plus `form.reset()` after `tick()`.
- **Select triggers with rich content** (actor avatar, customer status dot, project key) render through a `SelectValue` children snippet, and every Select passes `items`.
- **Slack install/link buttons and CSV/JSON export links** carry `data-sveltekit-reload`, so they always do a full-page load, as the lane notes require.
- **Request date** (`<time>` in the requests timeline): React's `suppressHydrationWarning` has no Svelte equivalent. If server and browser time zones differ, the server's date text stays until the next client render.
- **Customer form:** `<form onkeydown>` (⌘Enter to submit) has one a11y warning suppressed, with a comment explaining why.
- **GSD workflow:** the project CLAUDE.md asks for edits to go through a GSD command. I didn't, because the lane workflow defines how this work runs and the global extension policy forbids optional skills.

## 4. Cross-lane imports I rely on (all present and type-checking)

- **L4:**
  - `issue-pickers` PickerPopover contract: the `children` snippet receives `{ props }`, used through `epics/member-picker.svelte` (L6).
  - `issue-hierarchy/issue-ref-row.svelte` with `issue`.
  - `issue-detail/property-row.svelte` with `label` + `children`.
- **L5:**
  - `editor/markdown.svelte` takes `source=` (the React `children` string).
  - `editor/markdown-editor.svelte` takes `value`, `onChange`, `onSubmit`, `onCancel`, `autoFocus`, `maxLength`, `aria-label`.
  - `comments/timestamp.svelte` with `date`.
- **L3a:** `relativeTime` from `@/lib/components/issues/issue-properties`.
- **L1:**
  - `sidebarRowClass` from `@/lib/components/app-shell/sidebar-nav`.
  - `pwa/push-settings.svelte`.
  - The project layout must provide the ProjectData context for the customers pages.
- **L7:** `inbox/notification-prefs-form.svelte` with a `pushSection` snippet.
- **L8:**
  - `settings/field.svelte` (`hint` is a string or snippet).
  - `settings/profile-form.svelte`, `password-form.svelte`, `appearance-form.svelte`.
  - `project-templates/template-select.svelte`, plus `useProjectTemplates(() => open)` returning `.current`.

## 5. Coordinator to-dos

None: no changes needed to packages, config or env. Action refreshes rely on the generator's refresh flags; I added no `refreshAll()` of my own.

## 6. Last kit-check

```
kit-check: 0 error(s) in src/lib/components/customers src/lib/components/audit src/lib/components/integrations src/lib/components/slack src/lib/components/workspaces src/routes/dashboard/projects/\[id\]/customers src/routes/dashboard/projects/\[id\]/members src/routes/dashboard/settings/\+page src/routes/dashboard/settings/appearance src/routes/dashboard/settings/notifications src/routes/dashboard/settings/profile src/routes/dashboard/settings/slack src/routes/dashboard/workspaces/\[slug\]/\+page src/routes/dashboard/workspaces/\[slug\]/audit
```

A separate `svelte-check --threshold warning` run showed only the customer-form a11y warning, which is now suppressed. The 1 error in the full run is in `src/components/editor/actions.ts`: it resolves `./context` to a `.tsx` file and `--jsx` is not set. That file belongs to L5.


### L9a review

- [minor] src/lib/components/workspaces/workspace-member-row.svelte: Lines 86-87: `{member.name}` and `{#if isSelf}<span class="ml-1.5 …">(you)</span>{/if}` sit on separate lines inside a block-level `<span class="block truncate …">`. Svelte turns that line break into a visible space. React (workspace-members.tsx:196-197) put them on separate JSX lines too, but JSX drops whitespace that contains a newline, so React showed "Name(you)" spaced only by ml-1.5. The port adds roughly 4px of extra gap before "(you)", which breaks pixel parity. → Put both on one line with nothing between them: `{member.name}{#if isSelf}<span class="ml-1.5 font-normal text-muted-foreground">(you)</span>{/if}`.
- [minor] src/lib/components/audit/audit-filter-bar.svelte: Lines 65-82: `pending` is one boolean that each `update()` sets to true and clears in its own `finally`. When the user changes a second filter while the first navigation is still running (for example, the issue input's blur followed by the Clear click, or two quick date edits), Kit supersedes the first navigation and its goto promise resolves early. That sets `pending = false` and hides the spinner while the second, still-running navigation keeps loading. React's `useTransition` (audit-filter-bar.tsx:47,62) stays pending until every queued transition has finished. → Count navigations in flight: `let inFlight = $state(0); const pending = $derived(inFlight > 0);`. Increment before `goto` and decrement in `finally`.
- [minor] src/lib/components/integrations/api-key-settings.svelte: Lines 34 and 90: `new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })` formats the Created column during SSR with the server's default locale. On a text mismatch, React 19 re-rendered on the client, so users saw dates in their browser's locale. Svelte keeps the server's text after hydration, so a browser in another locale (for example de-DE) keeps seeing the server-locale date. The builder documented this hydration gap only for the requests timeline, not for this table. → Render the date only on the client, for example `{#if browser}{dateFormat.format(…)}{:else}…{/if}`, or recompute it in an `$effect` after mount. Or at least list it next to the requests-timeline note as a known difference.
- [minor] src/lib/components/customers/customer-detail.svelte: Lines 72-80: when a save fails, the rollback is `customer = serverCustomer`. That throws away every optimistic patch, including one from a second save that is still in flight (for example, change status and then owner quickly, and the status save fails). The owner change then flips back until its refresh lands. React's `useOptimistic` (customer-detail.tsx:94-107) keeps the other transitions' pending patches and drops only the failed one. → Track pending patches as a list: build the value from `serverCustomer` plus the in-flight patches, remove only the failed patch on error, and clear the list once the refreshed `serverCustomer` arrives. Or document this as an accepted difference.


### L9a fix report

# L9a review fixes

Three of the four findings are fixed. The fourth (API key dates) is left as it is, because its premise is wrong; the reason is below. Nothing has been run in a browser.

## Findings

1. **`workspace-member-row.svelte`, "(you)" spacing: fixed.** `{member.name}` and the `{#if isSelf}…(you)…{/if}` block now sit on one line with nothing between them. Only `ml-1.5` separates them now, as in React.

2. **`audit-filter-bar.svelte`, spinner hides too early: fixed.** The single `pending` flag is now a count of navigations in flight: `let inFlight = $state(0); const pending = $derived(inFlight > 0);`. Each `update()` adds one before `goto` and subtracts one in `finally`. When a newer navigation replaces an older one, the older one finishing no longer hides the spinner while the newer one is still loading.

3. **`api-key-settings.svelte`, date in the server's locale: skipped.** The finding assumes Svelte keeps the server's text after hydration. It doesn't.
   - `{dateFormat.format(new Date(key.createdAt))}` compiles to `$.template_effect(($0) => $.set_text(text_6, $0), …)`. I checked this by compiling the component.
   - `set_text` in `node_modules/svelte/src/internal/client/render.js:46-53` (Svelte 5.57.3) first reads the current text (`TEXT_CACHE ??= text.nodeValue`). If the value computed in the browser is different, it replaces the text.
   - The template effect runs straight away while the page hydrates. So a browser in another locale (for example de-DE) ends up showing its own locale's date, which is what React 19's client re-render produced.
   - The same applies to the requests-timeline `<time>` text (`requests-timeline.svelte:86`). The builder's earlier note that "the server's date text stays until the next client render" is also wrong, and that note can be dropped.

4. **`customer-detail.svelte`, failed save rolls back other edits: fixed.**
   - The writable `$derived` is replaced by a list of pending patches: `pendingPatches = $state.raw<{ patch }[]>([])`, with `customer = $derived(pendingPatches.reduce(merge, serverCustomer))`.
   - `save()` adds its patch, awaits `updateCustomer`, and shows a toast on `!ok`. In `finally` it removes only its own patch.
     - **On success:** the refreshed `serverCustomer` already includes the change, because the wrapper refreshes before it resolves.
     - **On failure:** only that save's patch is rolled back. Other saves still in flight keep theirs.
   - This also fixes a related bug in the old code: one save's refresh landing used to wipe the optimistic patch of a second save that was still running.
   - One small difference from React 19 remains. React holds all pending async transitions together, so a failed patch only disappears once every transition has finished. Here it disappears as soon as its own save settles.
   - `customer` is now read-only (a `const` `$derived`). Nothing else in the file assigned to it.

## API changes other lanes must know

None. Props and exports are unchanged.

## Final kit-check

```
kit-check: 0 error(s) in src/lib/components/customers src/lib/components/audit src/lib/components/integrations src/lib/components/slack src/lib/components/workspaces src/routes/dashboard/projects/[id]/customers src/routes/dashboard/projects/[id]/members src/routes/dashboard/settings/+page src/routes/dashboard/settings/appearance src/routes/dashboard/settings/notifications src/routes/dashboard/settings/profile src/routes/dashboard/settings/slack src/routes/dashboard/workspaces/[slug]/+page src/routes/dashboard/workspaces/[slug]/audit
```

Files changed:
- /home/oscar/Projects/ticket-system/src/lib/components/workspaces/workspace-member-row.svelte
- /home/oscar/Projects/ticket-system/src/lib/components/audit/audit-filter-bar.svelte
- /home/oscar/Projects/ticket-system/src/lib/components/customers/customer-detail.svelte


---

## L9b build report

## L9b report: dashboards, insights, charts

All 17 files are ported with no TODOs or stubs. The last kit-check shows 4 errors, all caused by files other lanes haven't written yet (section 6). A `svelte-check` run at warning level shows no warnings in my files. I did not run the app, so none of this is tested in a browser.

### 1. Source → target mapping
All targets are under `/home/oscar/Projects/ticket-system/src/lib/components/` unless a route path is given.

| Source | Target(s) |
|---|---|
| `charts/chart-frame.tsx` | `charts/chart-frame.svelte.ts` (`CHART_MARGIN`, `niceScale`, `tickIndexes`, `SwatchKind`, `ActiveIndex` class, `useActiveIndex`), `charts/chart-tooltip.svelte` (`ChartTooltip`), `swatch.svelte` (`Swatch`), `chart-legend.svelte` (`ChartLegend`), `chart-table.svelte` (`ChartTable`), `y-axis.svelte` (`YAxis`) |
| `charts/bar-chart.tsx` | `charts/bar-chart.svelte` (types `BarDatum`, `BarChartProps` are exported from its module script) |
| `charts/line-chart.tsx` | `charts/line-chart.svelte` (types `LineSeries`, `LineChartProps`) |
| `insights/chart-kit.tsx` | `insights/chart-kit.svelte.ts` (`niceMax`, `IndexHover`/`useIndexHover`, `formatWeek`, `formatHours`), `insights/chart-tooltip.svelte`, `series-key.svelte`, `sr-table.svelte` |
| `insights/bar-list.tsx` | `insights/bar-list.svelte` (type `BarListKind`) |
| `insights/column-chart.tsx` | `insights/column-chart.svelte` (type `Column`) |
| `insights/trend-chart.tsx` | `insights/trend-chart.svelte` |
| `insights/insights-view.tsx` | `insights/insights-view.svelte`, plus local helpers `insights-panel.svelte` and `insights-stat.svelte` |
| `dashboards/dashboard-list.tsx` | `dashboards/dashboard-list.svelte` (`DashboardList`), `dashboards/new-dashboard-button.svelte` (`NewDashboardButton`) |
| `dashboards/dashboard-details-dialog.tsx` | `dashboards/dashboard-details-dialog.svelte`, `dashboard-details-form.svelte` (the inner `DetailsForm`) |
| `dashboards/dashboard-view.tsx` | `dashboards/dashboard-view.svelte`, `widget-menu.svelte` (the inner `WidgetMenu`) |
| `dashboards/pulse-feed.tsx` | `dashboards/pulse-feed.svelte` |
| `dashboards/widget-body.tsx` | `dashboards/widget-body.svelte` |
| `dashboards/widget-editor.tsx` | `dashboards/widget-editor.svelte`, `widget-editor-form.svelte`, `widget-field.svelte`, `widget-choice.svelte`, `widget-project-filters.svelte` |
| (new) | `dashboards/relative-time.ts` |
| `app/dashboard/dashboards/page.tsx` | `src/routes/dashboard/dashboards/+page.server.ts`, `+page.svelte` |
| `app/dashboard/dashboards/[dashboardId]/page.tsx` | `src/routes/dashboard/dashboards/[dashboardId]/+page.server.ts`, `+page.svelte` |
| `app/dashboard/projects/[id]/insights/page.tsx` | `src/routes/dashboard/projects/[id]/insights/+page.server.ts`, `+page.svelte` |

`widget-model.ts` and `widget-data.ts` are imported unchanged from `@/components/dashboards/`.

### 2. API decisions other lanes must know
- **Chart props:** `className` is now `class` on `BarChart` and `LineChart`. L7's `cycle-charts` must change this. `title`, `seriesLabel`, `bars`, `color`, `reference`, `height`, `formatValue`, `labels`, `pointLabels` and `series` are unchanged.
- **Import paths for L7:**
  - `import BarChart from '@/lib/components/charts/bar-chart.svelte'`
  - `import LineChart from '@/lib/components/charts/line-chart.svelte'`
  - `import type { LineSeries } from '@/lib/components/charts/line-chart.svelte'`
  - Insights components are default imports from `@/lib/components/insights/*.svelte`: `BarList` takes `rows`, `kind`, `empty`; `TrendChart` takes `weeks`.
  - `.svelte.ts` files are imported with the extension, e.g. `'./chart-frame.svelte.ts'`.
- **Chart helpers:** `useActiveIndex(count, indexAt)` and `useIndexHover(count, indexAt)` take `count` as a **getter**. Handlers are lowercase DOM names (`onpointermove`, `onkeydown`, `onblur`). `useIndexHover(...).handlers` is a spreadable object that includes `tabindex: 0`.
- **Chart width:** there is no `useChartWidth`. Use `<div bind:clientWidth={width}>` and render nothing while `width` is 0.
- **Tooltip rows:** `ChartTooltip` rows take `swatch: { color, kind? }` instead of a `ReactNode`. Only `BarChart` and `LineChart` use it.
- **`DashboardDetailsDialog`:** props are `open` (bindable) plus `onOpenChange`, `dashboard`, `projects`, `defaultProjectId`, `onSaved`. Both `bind:open` and the React-style pair work. `NewDashboardButton` takes `projects`.
- **`DashboardView`:** props are `dashboard`, `dataset`, `isOwner`, `canShare`. It seeds its widget list and `shared` flag once, as the React `useState` did. The dashboard page wraps it in `{#key data.dashboard.id}` because Next remounted per route param and Kit reuses the component.
- **`WidgetEditor`:** props are `widget` (non-null means open), `dataset`, `scopeProjectId`, `onOpenChange`, `onSave`.
- **Page data:** the insights page returns `{ data, weeks, ranges, labelId }`. The dashboards page returns `{ pulse, days, projects, dashboards, feed }`. The dashboard detail page returns `{ dashboard, dataset, isOwner, canShare }`.

### 3. Not ported 1:1
- **`relativeTime`:** `issue-properties.tsx` is a React component module with no agreed Svelte home for its plain helper. I made `dashboards/relative-time.ts`, an identical 12-line copy. If L3a exports it somewhere shared, `dashboard-list.svelte` and `pulse-feed.svelte` can switch to that.
- **No `router.refresh()` calls:** `DashboardList` (after delete) and `DashboardView` (`onSaved` after rename) called `router.refresh()`. The generated `deleteDashboard` and `updateDashboard` wrappers already refresh after `revalidatePath`, and the coordinator note says not to refresh again.
- **Delete from the detail page:** that wrapper refresh reloads the page load for the dashboard that was just deleted. Its load now returns a 404, so the error page may flash before `goto('/dashboard/dashboards')`. I did not work around it.
- **Selects:** every `Select` gets `items`. The label select in `InsightsView` uses a `SelectValue` snippet so the colour dot still shows in the trigger. `Choice` became `widget-choice.svelte`, a generic component.
- **Strictly controlled switch:** the "Shared" `Switch` uses a function binding (`bind:checked={() => shared, toggleShared}`), as W1b recommends.
- **`useTransition`:** it became an in-flight counter (`pending` is true while any save, share, duplicate or delete is running). `InsightsView` sets `pending` around `await goto(url, { replace: true, reset: false })`.
- **`router.replace` in `InsightsView`:** this is a real navigation, so the page load reruns and picks up the new `range` or `label`.
- **Trend chart width:** it comes from `bind:clientWidth`, which rounds. React's `column-chart`/`trend-chart` used floor and `chart-frame` used round, so a 1px difference is possible.
- **Intentionally identical:** SVG, class strings, a11y attributes and keyboard behaviour are copied as they were. Dropped as React-only: `suppressHydrationWarning` on `<time>` and `useEffectEvent`.

### 4. Cross-lane imports and assumed props
- **L1:**
  - `@/lib/components/navigation/nav-issue-row.svelte`: props `issue`, `project?` (the other React props are unused here). Missing today.
  - `@/lib/components/navigation/favorite-button.svelte`: props `targetType`, `targetId`. Missing today.
  - `@/lib/components/project-list.server` exporting `getProjectsForUser(userId)`, as the lane notes promise. Missing today.
  - `useProjectData()` in context for `InsightsView`, which L1's project layout must provide.
- **L6** (all exist and type-check):
  - `epics/epic-icon.svelte`: `color`, `class`.
  - `epics/health-chip.svelte`: `health`, `class`.
  - `epics/progress-ring.svelte`: `percent`, `size`, `color`.
- **L3b** (exist and type-check): `views/filter-menu.svelte`, `filter-chips.svelte`, `search-syntax-help.svelte`, with the same props W1c assumed in `issue-filters.svelte`. `appendToken` is inlined, as W1c did.
- **Already in the repo:**
  - Wave 1 primitives and contexts: `ui/*`, `ui-icons`, `project/project-data-provider.svelte`, `palette-commands.svelte`.
  - Shared actions and libs: `@/lib/actions/dashboards`, `@/lib/session`, `@/lib/dashboards`, `@/lib/pulse`, `@/lib/insights`, `@/lib/project-data`.
- **Type-only imports** from `@/lib/dashboards`, `@/lib/pulse` and `@/lib/insights` are erased at build, so no server code reaches the client.

### 5. For the coordinator
- Nothing is needed in config, packages or env.
- The `.well-known` route is not mine. Tailwind must scan `src/lib/components/**/*.svelte`, which is the default.
- L7's cycle charts must update their `BarChart`/`LineChart` imports and use `class` instead of `className`.
- Please confirm L1 creates `project-list.server.ts`, `nav-issue-row.svelte` and `favorite-button.svelte` at the paths above.

### 6. Last kit-check
```
"src/routes/dashboard/dashboards/+page.server.ts" 7:36 "Cannot find module '@/lib/components/project-list.server' ..."
"src/routes/dashboard/dashboards/+page.server.ts" 29:29 "Parameter 'p' implicitly has an 'any' type."   (follows from the missing module)
"src/lib/components/dashboards/widget-body.svelte" 11:27 "Cannot find module '@/lib/components/navigation/nav-issue-row.svelte' ..."
"src/lib/components/dashboards/dashboard-view.svelte" 22:30 "Cannot find module '@/lib/components/navigation/favorite-button.svelte' ..."
kit-check: 4 error(s)
```
The insights route and everything under `charts/` and `insights/` check clean.


### L9b review

- [minor] src/lib/components/insights/insights-view.svelte: Lines 66 and 76-81: both Selects pass `value={...}` + `onValueChange` with no binding. Per WAVE1_APIS (W1b, 'Strictly controlled values'), the trigger then changes immediately. React's Radix Select was controlled by `weeks` / `labelId` and kept the old value until router.replace committed. Two effects: (1) if the navigation fails or is cancelled, the range trigger shows a value the page data doesn't use; (2) the label trigger's custom SelectValue snippet reads `labelId`, so the range trigger flips immediately while the label trigger waits for the load, which is inconsistent. Also, `pending` is reset in the `finally` of the first goto even when a second setParam navigation is still running. React's transitions stayed pending until the last one settled. → Use function bindings so the trigger follows the server state: `bind:value={() => String(weeks), (v) => setParam('range', v)}` and `bind:value={() => labelId ?? ALL, (v) => setParam('label', v === ALL ? null : v)}`. Make `pending` an in-flight counter (as dashboard-view does) instead of a boolean.
- [minor] src/lib/components/dashboards/relative-time.ts: This is a private copy of relativeTime(). The builder's reason was that there was no shared Svelte home, but L3a now exports the same helper from src/lib/components/issues/issue-properties.ts, the path that matches the React import `@/components/issues/issue-properties`. Three copies now exist: dashboards/, navigation/ and issues/. dashboard-list.svelte:36 and pulse-feed.svelte:14 import the local copy. → Import `relativeTime` from '@/lib/components/issues/issue-properties' in dashboard-list.svelte and pulse-feed.svelte, then delete dashboards/relative-time.ts.
- [minor] src/lib/components/dashboards/widget-editor-form.svelte: Lines 64-68 redefine appendToken() inline. React imported it from views/search-syntax-help, and L3b's port already exports it from the module script of src/lib/components/views/search-syntax-help.svelte (`import SearchSyntaxHelp, { appendToken } from ...`). The duplicate will drift if L3b changes the token rules. → `import SearchSyntaxHelp, { appendToken } from '@/lib/components/views/search-syntax-help.svelte';` and remove the local function.
- [minor] src/lib/components/dashboards/dashboard-view.svelte: Lines 371-379, delete from the detail page: the deleteDashboard wrapper awaits refreshAfterWrite(), which reruns this route's load for the dashboard just deleted. That load now hits `error(404)` in [dashboardId]/+page.server.ts:18, so Kit renders the error page and unmounts DashboardView. Only then do the toast and `goto('/dashboard/dashboards')` run, so the user briefly sees a 404 page. The builder's report mentions this but leaves it unresolved. It needs a coordinator decision: the generated wrapper can't skip its refresh. → Coordinator: either have the generator support a no-refresh/navigate-after variant (e.g. call `remote.deleteDashboard` and then `goto('/dashboard/dashboards', { refreshAll: true })`), or accept the flash and note it as a known deviation.


### L9b fix report

All four findings are fixed, and kit-check reports 0 errors in this lane's files. I did not run the app, so none of this is tested in a browser.

**Findings**
1. **Insights selects (fixed)** in `insights/insights-view.svelte`.
   - Both selects now use function bindings: `bind:value={() => String(weeks), (v) => setParam('range', v)}` and `bind:value={() => labelId ?? ALL, (v) => setParam('label', v === ALL ? null : v)}`. The triggers follow the loaded data rather than flipping on click.
   - `pending` is now an in-flight counter (`inflight++` before `goto`, `inflight--` in `finally`). It stays true until the last overlapping navigation settles.
2. **Duplicate `relativeTime` (fixed).**
   - `dashboard-list.svelte` and `pulse-feed.svelte` now import it from `@/lib/components/issues/issue-properties`.
   - I deleted `dashboards/relative-time.ts`.
3. **Duplicate `appendToken` (fixed).** `widget-editor-form.svelte` now imports `SearchSyntaxHelp, { appendToken }` from `views/search-syntax-help.svelte`, and the local copy is removed.
4. **Delete from the detail page (fixed in this lane, no coordinator change needed).**
   - `dashboard-view.svelte` now calls the generated `deleteDashboard` command from `@/lib/remote/dashboards.remote` directly, as `deleteDashboard([{ id }])`. That skips the wrapper's `refreshAfterWrite()`, so the route's load no longer reruns for the deleted dashboard and the 404 page no longer shows.
   - After a successful delete it shows the toast and calls `goto('/dashboard/dashboards', { refreshAll: true })`.
   - If the command returns a redirect, it follows it with `goto(out.redirect, { refreshAll: true })`, which is the same handling as the wrapper's `settle`.
   - `DashboardList`'s delete still uses the wrapper, since it needs the refresh.

**API changes other lanes must know**
- None. `dashboards/relative-time.ts` no longer exists; nothing outside this lane imported it.

**kit-check**
- Command: `scripts/kit-check.sh` on `charts`, `insights`, `dashboards`, `src/routes/dashboard/dashboards` and `src/routes/dashboard/projects/[id]/insights`.
- Result: `kit-check: 0 error(s)`.
- The four errors in the builder's report (missing `project-list.server`, `nav-issue-row.svelte` and `favorite-button.svelte`) are gone, so those L1 files now exist.


---

## L10 build report

## L10 report: API routes and .well-known

### 1. Source → target mapping
Every Next route handler is now a `+server.ts` at the same path under `src/routes/`. All paths below are relative to `/home/oscar/Projects/ticket-system/src/`, and `<…>` means the route file, e.g. `app/api/audit/route.ts` → `routes/api/audit/+server.ts`.

| Source (`app/…`) | Target (`routes/…`) |
|---|---|
| `.well-known/oauth-authorization-server/api/auth/route.ts` | `[x+2e]well-known/oauth-authorization-server/api/auth/+server.ts` |
| `api/attachments/route.ts`, `api/attachments/[attachmentId]/route.ts` | `api/attachments/+server.ts`, `api/attachments/[attachmentId]/+server.ts` |
| `api/uploads/route.ts`, `api/uploads/[uploadId]/route.ts` | `api/uploads/+server.ts`, `api/uploads/[uploadId]/+server.ts` |
| `api/audit/route.ts` | `api/audit/+server.ts` |
| `api/collab/[key]/route.ts` | `api/collab/[key]/+server.ts` |
| `api/cron/daily/route.ts` | `api/cron/daily/+server.ts` |
| `api/graphql/route.ts` | `api/graphql/+server.ts` |
| `api/projects/[id]/{changes,export,presence,stream}/route.ts` | `api/projects/[id]/{changes,export,presence,stream}/+server.ts` |
| `api/push/subscriptions/route.ts` | `api/push/subscriptions/+server.ts` |
| `api/slack/{commands,events,install,interactivity,link}/route.ts`, `api/slack/oauth/callback/route.ts` | `api/slack/<same>/+server.ts` |
| `api/v1/_lib/api.ts` | `api/v1/_lib/api.ts` (not a route, because the name has no `+`) |
| `api/v1/{me,projects}/route.ts`, `api/v1/issues/[key]/route.ts`, `api/v1/issues/[key]/comments/route.ts`, `api/v1/projects/[id]/{issues,labels,members,states}/route.ts` | same paths with `+server.ts` |
| `api/webhooks/github/route.ts`, `api/webhooks/{bitbucket,gitlab,sentry}/[integrationId]/route.ts` | `api/webhooks/<same>/+server.ts` |
| `api/auth/[...all]/route.ts` | not ported on purpose: `src/hooks.server.ts` answers `/api/auth/*` through `svelteKitHandler` |

### 2. API decisions other lanes must know
- No exports or props that other lanes import. The only shared module is `routes/api/v1/_lib/api.ts`, used by the v1 handlers.
- `apiRoute()` in `_lib/api.ts` now returns `({ request, params }) => Promise<Response>`, which is a SvelteKit handler. Its auth, scope and error semantics are unchanged.
- URLs, methods, status codes, headers and bodies are the same. That includes the SSE, streaming CSV and JSON audit export, the collab long-poll, and the Slack acks.
- Session now comes from `locals.user`, which `hooks.server.ts` already resolves. This replaces `getSession()` and saves a second session lookup per request. `authorizeProjectAction` and the other `@/lib` helpers still call `getSession()` internally through the shims and work as before.

### 3. Not ported 1:1
- **`revalidatePath` dropped** in `/api/attachments` POST and `/api/push/subscriptions` POST and DELETE, because the shim makes it a no-op. Callers must refresh page data themselves after these calls, using `refreshAfterWrite()` from `src/lib/svelte/refresh.svelte.ts`. Attachment upload is called from the issue-detail attachments section (L4), and push subscribe/unsubscribe from `pwa/push-settings` (L1).
- **`maxDuration`** becomes `export const config = { maxDuration: N }`. It is set to 60 for the `stream` and `cron/daily` routes and 30 for `collab/[key]`. adapter-vercel reads it and adapter-node ignores it. I commented this in the files.
- **`after()`** now comes from `@/lib/kit/next-shims`, imported directly instead of `next/server`, in the Slack commands/interactivity, GitHub, GitLab, Bitbucket, Sentry and collab routes.
- **`.well-known`** is served from the `[x+2e]well-known` directory, as the reference's verification item 17 says. The handler is now `GET: RequestHandler = ({ request }) => metadata(request)`.
- **collab `authorize()`** has an explicit return type. The old `'error' in auth` check no longer narrowed once `user` came from `locals`, so it now uses `auth.error`. Behaviour is identical.
- **Internals the routes lean on** (`src/lib/slack/oauth.ts`, `api-auth.ts` and the GitHub/VCS webhook helpers) still use `NextResponse` and `after` through the aliased shims. I did not change them.
- **graphql** still imports `yoga` from `@/lib/graphql/schema`. The reference suggested moving it to `src/lib/server/graphql`, but that file is not mine to move. It is only imported from a `+server.ts`, so it never reaches client code.

### 4. Cross-lane imports I rely on
- `@/lib/kit/next-shims`, for `after`.
- `@/components/issue-hierarchy/attachment-utils`, for the attachment size limit and the inline-safe and previewable checks. It is React-free and on the plan's as-is list.
- Everything else comes from `@/lib/*`, `@/db/schema` and `@better-auth/oauth-provider`.
- All of these exist, and I made no stubs.

### 5. Things the coordinator must do
- **Set `BODY_SIZE_LIMIT`.** adapter-node's default is 512K and would 413 these routes before the handlers run. In-handler limits are:
  - 4 MB + 64 KB for `/api/attachments` and `/api/uploads`
  - 5 MB for the GitHub, GitLab, Bitbucket and Sentry webhooks
  - 1 MB for Slack
  - 100 KB for graphql
  - 100 KB state vectors and the collab update limit, in `/api/collab`

  I recommend `BODY_SIZE_LIMIT=6M` in the Dockerfile, compose file and `.env`. `vite dev` applies no limit.
- **Keep the CSRF exemption for `^/api/slack/`** in `hooks.server.ts`. The Slack routes need it, and it is already there.
- **Update the comment in `src/lib/auth.ts`:** line 130 still points to the old `src/app/.well-known/…/route.ts` path.
- **Check the Vercel cron config** after cutover. `vercel.json` already points at `/api/cron/daily`, so it should keep working.

### 6. Last kit-check result
```
kit-check: 0 error(s) in src/routes/api src/routes/.x.2e.well-known
```
There were no "Cannot find module" errors. An unfiltered check shows 4 errors elsewhere in the repo and none in `src/routes/api` or `[x+2e]well-known`. I only type-checked; nothing was run against a server.


### L10 review

- [major] src/hooks.server.ts: Requests from token-authenticated machine clients to L10 routes now get 403 in production, so the port is not at parity. In the CSRF hook (hooks.server.ts:21-41), a POST/PUT/PATCH/DELETE is rejected when its content type is missing or form-like and its Origin is not the app's origin, unless the path is in CSRF_EXEMPT. Only /api/auth/sso, /api/auth/oauth2/* and /api/slack/ are exempt. The v1 REST API authenticates with a Bearer token only (src/lib/api-auth.ts:147-148), and its callers send no Origin. Its documented delete call, `curl -X DELETE -H "Authorization: Bearer $TICKETS_KEY" "$TICKETS_URL/issues/APP-42"` (docs/API.md:204), sends no Content-Type. It therefore hits routes/api/v1/issues/[key]/+server.ts:34 as a 403 "Cross-site form submissions are forbidden" instead of 200. Any v1 POST/PATCH sent with `curl -d`, which defaults to form-urlencoded, fails the same way. Under Next, route handlers had no origin check, and readJsonBody parsed the body whatever its content type. The builder's report says methods and status codes are the same, and its coordinator section lists only the Slack exemption, so this gap is not flagged anywhere. → Coordinator (hooks.server.ts is not L10's file): add `/^\/api\/v1\//` to CSRF_EXEMPT. These handlers authenticate only by Bearer token and never by cookie, so CSRF does not apply to them. Also exempt `/^\/api\/graphql$/`, `/^\/api\/webhooks\//` and `/^\/api\/cron\//` for the same reason: they authenticate by token, signature or CRON_SECRET. Then amend the L10 report's coordinator actions to list these exemptions next to the Slack one.


### L10 fix report

## L10 fix report

### Finding: token-authenticated clients get 403 from the CSRF hook (`src/hooks.server.ts`, major)

**Skipped in this lane's files. The finding is correct, and the fix belongs to the coordinator.**

`src/hooks.server.ts` is not an L10 target. PLAN.md line 195 says to ask in the report for files outside the lane, and the finding itself assigns the fix to the coordinator. Edits there would also collide with other lanes. I checked the hook:

- `CSRF_EXEMPT` currently covers only `/api/auth/sso/saml2/...`, `/api/auth/oauth2/(token|introspect|revoke)` and `/api/slack/`.
- A POST/PUT/PATCH/DELETE with no `Content-Type` or a form-like one, and no matching `Origin`, gets 403 outside dev. That breaks the documented v1 `curl -X DELETE` and any `curl -d` call.
- The L10 handlers authenticate by Bearer token, signature or `CRON_SECRET`. None use cookies, so CSRF does not apply to them.
- No L10 source change is needed. The routes behave as before once the hook exempts them.

**Coordinator action, to add next to the Slack exemption.** Add these to `CSRF_EXEMPT` in `src/hooks.server.ts`:
```ts
/^\/api\/v1\//,
/^\/api\/graphql$/,
/^\/api\/webhooks\//,
/^\/api\/cron\//,
```
Also make sure the exemption list in `PLAN.md` and the hook's comment cover them.

The L10 report's coordinator list now reads as follows.
- Set `BODY_SIZE_LIMIT=6M` in the Dockerfile, compose file and `.env`.
- Keep the `^/api/slack/` CSRF exemption.
- Add the four exemptions above.
- Update the comment at `src/lib/auth.ts` line 130, which still points to `src/app/.well-known/.../route.ts`. The new location is `src/routes/[x+2e]well-known/.../+server.ts`.
- Check that the Vercel cron config still reaches `/api/cron/daily`.

### API changes other lanes must know
None. L10 files are unchanged in this pass.

### Final kit-check
```
kit-check: 0 error(s) in src/routes/api src/routes/[x+2e]well-known
```