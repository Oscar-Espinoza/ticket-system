# Parity pass reports (Kit vs Next reference screenshots + React behaviour)



---

## parity:L1

I found and fixed two differences in L1's Svelte files. On all four of my routes the new app now matches the Next screenshots. The only differences left are Next's dev "N" badge and relative-time text that has moved on since the reference shots.

## (1) Differences found and fixed

1. **Topbar Search button sat 8px too far right on every dashboard page** (`src/lib/components/topbar-chrome.svelte`). In React, sonner's `<Toaster>` was rendered inside the topbar. Its empty `<section>` took a slot in the `gap-2` row and pushed the button in from the edge. The port moved the Toaster to the root layout, so that slot was gone. I added an empty `<span aria-hidden="true">` with a comment. The button is now at x=1273.7, the same as Next.
2. **Ticket key field in the create-project dialog showed raw input** (`src/lib/components/create-project-dialog.svelte`). Typing `we-b1x` stayed as `we-b1x`; React shows `WEBX`. The `bind:value` getter/setter updated the state but never wrote the result back to the field. I replaced it with `value={ticketKey}` plus an `oninput` that transforms the text and writes it back. Now `we-b1xyzq` becomes `WEBXYZ`, Backspace works, and the server's duplicate-key error still shows.

I also tried `goto(…, { keepFocus: true })` for palette navigations and reverted it: Kit 3 throws `goto_options_removed` for that option. `navigation-commands.svelte` is unchanged.

## (2) Differences remaining

**Outside my lane:**
- **No root `src/routes/+error.svelte`** (coordinator; no lane owns it). `/dashboard/nope` and `/totally-unknown` show Kit's unstyled "404 / Not Found" page. Next showed its built-in "404 | This page could not be found." page. Fix: add that file with the same markup as the 404 branch of `src/routes/dashboard/+error.svelte`, a "Something went wrong" state for other errors, and the title `404: This page could not be found.`.
- **Duplicate `dark` class on `<html>`** (W1c, `src/lib/svelte/theme.svelte.ts` / mode-watcher). After switching to light and back from the user menu, the class string reads `h-full antialiased dark dark`. It looks the same, but the theme writer should add the class once.
- **`replace_state_deprecated` warning** in the console, from `src/lib/svelte/search-params.svelte.ts:51` (W1c). Switch it to `goto(target, { state: page.state, shallow: true, replace: true })` if the synchronous behaviour that file's comment describes still holds.
- **Palette filtering is asynchronous** (bits-ui Command, W1a). If Enter comes within about 50ms of the last keystroke, the item highlighted before filtering runs. Normal typing is not affected.

**Framework differences, not fixable 1:1:**
- **Focus after a palette navigation.** SvelteKit moves focus to `<body>` after navigating; Next left it on the trigger. Kit 3's only switch for this, `reset: false`, also turns off scroll-to-top, so I left it.
- **Loading state.**
  - The skeletons appear after 150ms, as the lane note asks; Next showed `loading.tsx` at once.
  - While a skeleton shows, the breadcrumb, the active project tab and the sidebar highlight keep the old route until the load finishes. Next updated them at once.
- **Status code for a missing project.** It is now 404 (Next streamed a 200), which adds one "Failed to load resource 404" console entry. It looks the same.
- **Title of a missing workspace.** It reads `404: This page could not be found.`. L9a expected "Workspace not found", but which title Next actually showed can't be checked without the old app.

**Not a defect:** once, while I was offline, a hot reload triggered by another lane's edit replaced the page with Kit's 500 page. A clean repeat had no such crash.

## (3) Interactions checked against the React code

- **Command palette (Ctrl+K and `/`):**
  - Groups appear in this order: Projects, Navigation (including the extra navigation commands), Actions, Workspaces. Inside a project you also get Current project (Issues/Triage/Cycles/Epics/Members/Settings — Web), Issues and Templates.
  - Filtering works, "No results." shows when nothing matches, and Escape returns focus to the trigger.
  - Commands navigate correctly ("Cycles — Web", "Go to drafts").
  - The theme toggle works in both directions and updates the stored theme.
  - Ctrl+K inside the open palette is taken by the Command list's Ctrl+K "previous item" key binding, the same as cmdk in React.
- **`g` shortcuts:** `g i` opens `/dashboard/inbox` and `g p` opens `/dashboard`.
- **`?` overlay:** grouped by scope with duplicates removed. Inside a project it lists "Create issue C" and the Issues/Issue shortcuts.
- **`c` key:** outside a project it opens Create project. Inside, it goes to `?create=1` and the new-issue dialog opens.
- **Create-project dialog:**
  - An empty submit shows both field errors, and a duplicate key gives "This key is already in use".
  - The name field clears after every submit, like React 19's form reset.
  - Discard closes the dialog, and errors and the key are kept when it reopens.
  - Success (as bob) closes the dialog, shows the "Project created" toast and adds the project to the sidebar and list.
- **User menu:** shows name, email, Profile, Settings, the light/dark toggle and Log out. The theme persists after reload; I set it back to dark.
- **Sidebar:**
  - Collapsing persists after reload (`sidebar-collapsed=1`), and the expand button works.
  - A project's open state is saved in `sidebar-project:<id>` and survives reload.
  - The favorite star adds and removes "Web" in Favorites; I removed it again.
- **Project tabs:** the "…" menu shows Archive, Trash, a separator, then Members and Settings.
- **Shell on other pages:** breadcrumbs and the settings navs match the Next shots on settings, project settings, issue, workspace and members pages.
- **Loading:** the progress bar appears after 150ms. The dashboard skeleton shows when going from the dashboard to a project, and the issues skeleton when going from project Issues to Epics.
- **Offline banner:** appears and disappears with the connection.
- **Sync status:** I queued a harmless operation on a non-existent project. Offline, the pill shows "Offline · 1 change pending sync" above the banner. Back online it flushes and shows the "Couldn't sync …" toast.
- **Density:** `density=compact` gives `data-density="compact"` after reload.
- **404 pages:** `/` redirects to `/dashboard` (signed out, to `/login`). A missing issue shows "Project not found" inside the project layout.
- **Console:** no errors on any of my routes apart from the 404 resource entry above.

**Data I created:** bob now has a project "[L1] Probe" (key LONEP). Every setting I changed was put back.

## (4) Final kit-check

`kit-check: 0 error(s) in src/lib/components/topbar-chrome.svelte src/lib/components/create-project-dialog.svelte src/lib/components/navigation/navigation-commands.svelte`

## (5) Screenshot folders

- Final comparison: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L1-final`, compared with `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/r1`.
- Shell on other pages: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L1-2`
- Interactions: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L1-i`
- First run, before the fixes: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L1-1`
- Scripts: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/harness/L1-*.mjs`


---

## parity:L2

## L2 parity report: auth, security, OAuth apps, API keys, people

All seven L2 routes match the Next references, and every focus interaction behaves as the React source does. I edited no files: nothing I found traces back to an L2 Svelte file. kit-check on all L2 targets reports 0 errors.

### (1) Differences found and fixed
None. I found no difference caused by an L2 Svelte file.

The first round of shots showed the topbar Search button 8px further right than in Next on every dashboard page. That is L1 shell code, and it was already gone when I re-shot the final round.

### (2) Differences remaining, with cause
Pixel diffs against `r1/*.next.png`:
- **`/login` and `/signup` (signed in and signed out):** 0 differing pixels.
- **`/dashboard/people/…`:** only the clock value in the "local time" line differs, because the shots were taken at different times. The rest of the diff is the Next dev "Compiling" badge.
- **`/dashboard/settings/api-keys`:** an "[L10] parity key" created by another checker turns the empty state into a table, and the URL shows port 5173 instead of 3000. Both are data and environment, not defects.
- **`/dashboard/settings/oauth-apps`:** only the port in the Authorize URL.
- **`/dashboard/settings/security`:** the Sessions list is longer because other checkers' harnesses keep signing in as alice. The row layout and text format are identical.
- **`/dashboard/workspaces/acme/security`:** only the port in the ACS and entity ID URLs, plus the Next "Compiling" badge.
- **Font anti-aliasing:** no visible differences.

Two things I noticed outside my lane, neither of them a parity defect:
- **SSO error never shown (same in React):** in SAML "Metadata XML" mode, saving with a domain and blank metadata makes the action return an error on `samlEntryPoint`. That field is only rendered in Manual mode, so the user sees no error and no toast. React behaves the same way. The cause is in `src/app/actions/security.ts` `buildSamlConfig` and `workspace-sso-settings.tsx`. A fix, if wanted, is to also show field errors whose field isn't rendered as the form-level message: `{#if error && (!error.field || !renderedFields.includes(error.field))}`. Ports should keep React's behaviour until the React source changes.
- **Page title on a 404 (unverified):** for a missing or inaccessible profile, the title comes from L1's `src/routes/dashboard/+error.svelte`: "404: This page could not be found.". React's `generateMetadata` returns "Profile not found" (and "Workspace not found" for workspace security). I can't confirm which title Next actually showed, because there is no 404 reference shot. If it was the metadata title, the fix is outside my lane:
  - L2's loads would throw `error(404, 'Profile not found')` (and 'Workspace not found').
  - L1's `+error.svelte` would set `<title>{page.error?.message} · Ticket System</title>` when the message isn't "Not found".

### (3) Interactions checked against the React behaviour
Console output during these runs contained only the expected 400/401/404/422 responses for the deliberate failures, and there were no page errors.
- **Sign-in:**
  - Submitting empty shows "Email is required."; with an email but no password it shows "Password is required.". The field gets `aria-invalid` and `aria-describedby="email-error"`, and the error clears as you type.
  - A wrong password shows "Invalid email or password.", which clears when you type.
  - SSO mode changes the description and the "Work email" label, focuses the field and keeps the typed email. An address without "@" shows "Enter your work email."; an unknown domain shows the 404 message. "Other sign-in options" goes back.
  - Success goes to `/dashboard`, and `?redirect=/dashboard/inbox` is followed.
  - `?sso=1`, `?error=sso_required`, `invalid_state` and unknown error codes each show the right message and mode.
  - The Sign up / Sign in links carry a safe `redirect`; `https://evil.com` is dropped.
  - When already signed in, `/login` and `/signup` redirect to `/dashboard`, as Next did.
- **Sign-up:** empty email, empty password, short password ("Password must be at least 8 characters.") and an existing email ("An account with this email already exists. Sign in instead.") all show the right messages.
- **Sign-out:** User menu → Log out lands on `/login`, and `/dashboard` afterwards redirects to `/login`.
- **2FA setup dialog** (as carol, stopped before verifying):
  - The password field is focused. Empty gives "Enter your password." and a wrong password gives "That password isn't right.". Escape closes the dialog, and reopening starts with an empty field.
  - The verify step shows the grouped setup key, the otpauth link and field, and focuses the code field. Typing `12a3` becomes `123`; a short code gives "Enter the 6-digit code from your app.".
  - Cancel and reload still show "Off". The enable call stores an unverified 2FA record, which Better Auth does not switch on (`twoFactorEnabled` stays false), and carol can still sign in.
- **API keys:**
  - In the create dialog, the name field is focused and the submit button is disabled until a name is typed. Enter submits and opens the "Copy your API key" dialog (`lc_…`). The new row goes to the top and is still there after reload.
  - Revoke shows the confirmation 'Revoke "[L2] parity key"?'. Confirming shows the toast "API key revoked" and removes the row, also after reload.
- **OAuth app create dialog:**
  - The name field is focused, Confidential is selected by default, and the submit button needs both a name and a redirect URI.
  - Bad input shows the field errors ("javascript:" redirect URIs aren't allowed / "Homepage must be a valid URL.") with `aria-invalid`, and they clear as you type.
  - Clicking a radio's label selects it, and the arrow keys work.
  - After creating, "[L2] parity app registered" shows the client ID, secret and endpoints. The app is still listed after reload.
  - The menu offers Copy client ID / Rotate secret / Delete. Rotating shows "New client secret" with the extra "previous secret stopped working" text and only the secret field. Deleting asks for confirmation, shows the toast "Deleted [L2] parity app", and the empty state is back after reload.
- **Workspace security:**
  - The back link and the Audit log link point to the right pages.
  - Domain proof instructions: the development-mode text is shown, and the TXT line follows the typed domain (`_ticket-system.Example.org`, falling back to `acme.test`).
  - Submitting with no domain shows "Enter a domain like acme.com.", which clears as you type. Invalid metadata gives a field error, and OIDC with no issuer gives "Enter the issuer URL (https://…).".
  - The SAML Metadata/Manual and SAML/OIDC switches change the fields, the hints and the setup notes. Clicking the selected option again does not deselect it.
  - Nothing was saved: SSO is still off after reload.
  - Bob (admin) sees the form; carol (member) sees "Admins only" with no Audit log button.
- **Sessions** (as carol): I signed out a throwaway "L2probe/1.0" session. The "Session signed out" toast appeared and the row stayed gone after reload. The token kept working through the 5-minute cookie cache, which the UI text itself warns about.
- **People page:** bob's profile and alice's own profile, full page: header, local time, shared/"Your projects" with roles, assigned issues, and Recent activity with its spacing intact. "Edit profile" appears only on your own profile, and an unknown user id returns 404.

All test data has been cleaned up. The "[L2]" API key was revoked, the "[L2]" OAuth app was deleted and the probe session was signed out. No seeded data or settings were changed.

### (4) Final kit-check
```
kit-check: 0 error(s) in src/routes/(auth) src/routes/invite src/routes/oauth src/routes/request src/routes/dashboard/people src/routes/dashboard/settings/security src/routes/dashboard/settings/oauth-apps src/routes/dashboard/settings/api-keys src/routes/dashboard/workspaces/[slug]/security src/lib/components/oauth src/lib/components/security src/lib/components/people src/lib/components/invite-panel src/lib/components/join-project-button src/lib/components/member-list
```

### (5) Screenshot folders
- Final comparison (with `*.diff.png` overlays): `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L2-2`
- First round: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L2-1`
- Interaction screenshots: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L2-int`
- Full-page people shots, including the 404: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L2-full`
- Interaction scripts: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/harness/L2-auth.mjs`, `L2-login2.mjs`, `L2-2fa.mjs`, `L2-keys.mjs`, `L2-oauth.mjs`, `L2-sso.mjs` and `L2-sessions.mjs`, all in that folder.
- Diff tool: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/L2tools/diff.py`


---

## parity:L3a

# L3a parity report: issues list/board, archive, trash

All three routes match their Next references, and nearly every focus interaction behaves as the React source does. I found and fixed one defect: the new-issue dialog put the cursor on the wrong field. kit-check reports 0 errors for my paths.

## 1. Differences found and fixed
- **`/home/oscar/Projects/ticket-system/src/lib/components/issues/new-issue-dialog.svelte`**: when the dialog opened, focus landed on the "Template" button instead of the Title input. This happened whenever templates had loaded, whether the dialog was opened with the button or with `c`. In React, `autoFocus` focuses the input before Radix's focus handling runs, so focus stays on Title. In Svelte, bits-ui's default moves focus to the first tabbable element. Text you typed went to the template menu, so typing "[L3a] …" applied the Bug template.
  - Fix: `DialogContent` now has an `onOpenAutoFocus` handler that cancels the default and focuses `titleRef`.
  - Re-tested 5 opens, alternating button and `c`: the Title input had focus every time, at 50 ms and 550 ms.

## 2. Differences remaining (none are in my lane)
- **Search button in the header:** in my first shots it sat 8px further right (1282–1424 instead of 1274–1416). The header is not my lane (it is the app shell), and in my final shots it matches the reference, so another lane fixed it.
- **Console warning on every view/filter/issue URL change:** "replaceState deprecated", from the shared `src/lib/svelte/search-params.svelte.ts`. The file says it calls `replaceState` on purpose. It is a warning only and not my file.
- **The Next dev indicator** ("N" / "Compiling…") appears only in the reference shots.
- **One HTTP 500 on reload of `?view=board`:** it happened once and did not come back. Fetching the page directly and every later reload returned 200, so it was most likely another lane's hot reload landing mid-request.
- **Board drags scroll the whole page:** the dashboard layout uses `min-h-screen` and the document scrolls, so a drag near the bottom edge auto-scrolls everything. With few cards the board's geometry matches the React reference exactly (the `views/a9d3…` board shot), so I see no lane defect here.

## 3. Interactions checked against the React behaviour
All run in the new app with Playwright; the console showed no errors except the warning above.

**List view**
- **Hover:** row background changes and the checkbox appears.
- **Click:** sets `?issue=KEY`, opens the detail pane and marks the row active. Esc closes the pane and returns focus to the row.
- **Ctrl+click** toggles a row and **Shift+click** selects a range, with no text selected by accident.
- **Bulk bar:** shows "N selected" and a working Priority picker. Esc clears the selection.
- **Keyboard:** `j`/`k` follow the cursor, `x` toggles selection, Enter opens the issue, `s` opens the status menu (Esc returns focus to the row), Ctrl+A selects all 40 rows, and Space opens the peek (Enter there opens the pane).
- **Shortcuts:** `i` assigns to me, Ctrl+. copies the ID ("Copied WEB-44"), and Ctrl+Backspace asks for confirmation before trashing.
- **Groups:** collapse/expand works, and the hover "+" on a group header opens the dialog with that status pre-filled.
- **Drag between groups:** moving a row from Todo to Backlog changes its status.

**Context menu (right-click)**
- Header label and every entry match React: Status, Priority, Assignee, Labels, Due date, Copy ID (Ctrl+.), Copy link, Open in new tab, Archive, Move to trash….
- Changing status works, and the Labels submenu stays open while you toggle labels.
- Archive shows "Archived WEB-44 / Undo". Trash asks "Move WEB-44 to trash?" and then shows the toast with Undo.

**New issue dialog**
- Esc on an empty dialog: no toast.
- Esc with text: "Draft saved / View drafts", and the text is still there on reopen. Discard clears it.
- Possible duplicates shows WEB-31 for a similar title.
- Ctrl+Enter creates the issue: "Created WEB-44 / Undo", the row appears in Backlog, and it is still there after reload.

**Board view**
- The view switcher sets `?view=board` and the `issues-view=board` cookie.
- Dragging a card to another column changes its status and survives reload.
- Dragging within a column without Manual ordering shows "Switch ordering to Manual to reorder issues."
- With Manual ordering, a drag within the column reorders the cards and the order survives reload.
- Keyboard move (Space, →, Space) works.
- Ctrl/Shift-click selection follows column order, and clicking a card opens it with focus returning to the card on Esc.
- The card context menu works, and the column "+" pre-fills that column's status.
- Grouping by priority, swimlanes by assignee, and lane collapse all work.

**Filtering and archive/trash**
- `label:bug` updates the URL (`q=`) and filters to 11 rows. A query with no matches shows "No matching issues", and "Clear filters" brings back all rows.
- **Archive/trash restore:** Unarchive shows "Unarchived WEB-44" and Restore shows "Restored WEB-44". Both bring the issue back to the list.

**Cleanup**
- **WEB-44 "[L3a] Board drag test":** left in the trash. It was also assigned to Alice with priority High and the infra label while testing.
- **"[Bug]" draft:** an aborted test run accidentally created it, and I deleted it.
- **Seeded data:** no seeded issue was changed.

## 4. kit-check
`scripts/kit-check.sh src/lib/components/{issues,board,similar,sla} src/routes/dashboard/projects/[id]/{+page.svelte,+page.server.ts,archive,trash}` → **0 errors**.

## 5. Screenshot directories
- Final route comparison: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L3a-3` (compare with `…/shots/r1/*.next.png`)
- First pass: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L3a-1`
- Board saved view and `?view=board`, plus `settings/sla` (my form component; matches its reference): `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L3a-2`
- Interaction shots: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L3a-int`
- Test scripts: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/harness/L3a-*.mjs`

The repo's CLAUDE.md asks for edits to go through a GSD command. That isn't available to this worker, so I made the one fix directly inside my lane.


---

## parity:L3b

## L3b parity report: views, my issues, search

I found no defect that comes from the lane's Svelte files, so I made no edits. All six routes match their `.next.png` references in layout, spacing, type, colours, icons, data and ordering, and none logged a console error, page error or failed request. kit-check reports 0 errors.

### (1) Differences found and fixed
None.

### (2) Differences remaining
- **SLA chips on the "Due soon" list view** (`/dashboard/views/30ae06ae…`, which redirects to the project view). The new app shows chips like "Breached", "2d left" and "10h left" on list rows; the Next reference does not. This is not a defect:
  - The view's stored display options have `sla: true`.
  - Both `SlaChip` versions render only once the page has hydrated (React's server snapshot is null).
  - In the same Next run, the board view (`a9d3a337…`) does show "Breached" and "11d left" for the same issue, WEB-11.
  - So the Next list shot most likely caught the page before hydration finished. The r1 kit shot also lacked the chips; the shared SLA chip code (`src/lib/components/sla/use-now.svelte.ts`, not this lane) may have changed since then.
  - No fix needed.
- **Times and data:** "10 hr. ago" vs "11 hr. ago", and rows from other lanes ("[L4] …", "[L5] …") in search and the no-due-date sidebar.
- **Next dev overlay:** the "N" / "Compiling…" badge in the Next shots only.
- **Behaviour shared with React** (left as is, since parity is the goal):
  - When you drill into a filter property by keyboard, focus drops to the page body, because the menu body re-renders and its input is replaced. React's non-modal popover does the same, so typing and Backspace stop reaching the menu.
  - In the filter property list, chevrons sit at uneven x positions, because they split the free space with the hidden check icon.
  - The search syntax popover is shifted so its right edge sits exactly on the viewport edge.
  - The sticky, semi-transparent timeline group headers let weekend shading show through.
- **Test-timing artefact:** with Playwright's instant click, clicking a chip's edit button while the filter menu is open leaves it closed. bits-ui waits 10ms after pointer-down before closing the menu, and an instant click lands inside that window. With a realistic ~90ms click the menu stays open on the new property, as in React.

### (3) Interactions checked against the React behaviour
- **My issues:**
  - The four tabs give the right URLs (`?tab=…`, with no param for Assigned) and the title "My issues".
  - j/j/Enter opens the issue.
  - "Hide completed" works and resets on reload, as React's plain `useState` does.
  - Signed in as carol, the subscribed, activity and created tabs render.
- **Search:** tested `label:bug is:open`, `assignee:me priority:urgent`, `payment -form`, `"database index"`, a no-results query and an empty query.
  - Each gives the right counts, filter-term chips, empty-state text and page title.
  - Typing and Enter updates `?q=`.
  - Clicking an example in the syntax help appends it ("login is:open").
- **Saved views:**
  - The workspace list ("Your views") and the project list match.
  - The `/dashboard/views/[id]` short link redirects to the project view.
  - Its "…" menu offers "Edit details" and "Delete view"; the delete confirm text and "Deleted …" toast match.
- **Filter menu and chips:**
  - The `f` hotkey and the property list with counts work, and typing narrows it.
  - Enter drills into a property and the placeholder changes; Backspace goes back.
  - Picking a value toggles it, adds a chip and updates the URL. Single-value ranges such as Created close the menu.
  - The chip operators read "is", "is any of" and "include", and "+N" overflow shows.
  - Chip edit opens on that property with checked values; the × button removes the filter; Escape closes the menu.
- **Display menu:**
  - Shift+V opens it and the layout radios work.
  - Its rows change per layout, as in React:
    - list: Grouping, Sub-grouping
    - board: Swimlanes
    - table: Ordering only
    - calendar: Show sub-issues only
    - timeline: no sub-grouping and no property toggles
  - Sub-grouping options leave out the current grouping, and Escape inside a select closes only the select.
  - Property toggles use `aria-pressed`. "Reset to default" keeps the layout, and `?view=` updates.
- **Table:**
  - Header sort works with correct `aria-sort` (ascending for title and due date, descending otherwise), and the rows really reorder.
  - j, k and the arrow keys move between rows; Enter gives `?issue=`.
  - Select all switches the label to "Deselect all issues"; Escape clears the selection.
  - The status, assignee and labels cell pickers open, and Escape hands focus back to the row.
- **Calendar:**
  - Today, previous and next month work, and clicking a chip gives `?issue=`.
  - Removing the due filter fills the no-due-date sidebar.
  - Dragging from the sidebar onto a day sets the due date and survives reload; dragging day to day also works.
- **Timeline:**
  - Week and month zoom work, and the zoom survives reload in localStorage, as in React.
  - Today scrolls the view.
  - ←/→ moves the bar a day and Shift+→ extends the due date; mouse drag moves +2 days.
  - Escape cancels a drag in progress, and a plain click opens the issue.
  - The span and patch helpers are identical to React.
- **List drag:** reordering within a group under non-manual ordering shows "Switch ordering to Manual to reorder issues." and changes nothing.
- **Save view dialog:**
  - The name field is focused and pre-filled with "Due soon (copy)".
  - An empty name gives "Give the view a name." with `aria-invalid`; typing clears it.
  - Saving shows "Saved view “[L3b] Due soon copy”" and opens the new view.
  - "Update view" shows "Updated “…”", then goes disabled, and the change survives reload.
- **Test data:** I created "[L3b] Due soon copy" (later deleted) and issue WEB-48 "[L3b] drag test" (moved to trash). Seeded data was not changed.

### (4) kit-check
`scripts/kit-check.sh src/lib/components/views src/routes/dashboard/my-issues src/routes/dashboard/search src/routes/dashboard/views "src/routes/dashboard/projects/[id]/views"` → **0 errors**.

### (5) Screenshot dirs
- Route shots for comparison against `shots/r1/*.next.png`: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L3b-1`
- Interaction shots: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L3b-int`
- Scripts: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/harness/L3b-*.mjs`


---

## parity:L4

## L4 parity report: issue detail, hierarchy and pickers

Both lane routes, WEB-1 and WEB-2, now match their Next references. I fixed one difference, the browser tab title. Every focus interaction I exercised behaves like the React code and survives a reload, and the new app logged no console errors or page errors. Two differences remain, both in other lanes' files.

### (1) Differences found and fixed
- **`src/routes/dashboard/projects/[id]/issues/[key]/+page.svelte`**: the tab title was `WEB-1 Set up CI pipeline for the web app · Ticket System`. Next shows the title without the suffix. In Next, the project layout's plain-string `generateMetadata` title overrides the root `%s · Ticket System` template, so every page under a project loses the suffix. I dropped the suffix to match and added a comment explaining why. Re-shot: both titles now match the Next `.json` logs.

### (2) Differences remaining, with cause
- **Reference shots caught mid-load (not defects).** The Next reference shots were taken while data was still loading (Next took 6.8–21 s; the new app takes 2.2 s). That explains three visible differences:
  - The Next shots show the activity skeleton and no empty rows for Relations ("Add relation"), Attachments ("Drop files here or click to upload") and Customer requests ("Add customer request"). React renders those rows once its fetch finishes (`relations !== null && list.length === 0`), so the new app's rows are correct.
  - The WEB-2 bell is outline in Next and filled in the new app. In React the bell stays unfilled until the subscriber list arrives; Alice is a subscriber, so filled is correct.
  - "In status" reads `35d` in the Next shot and `35d 1h` in the new one. That is only elapsed time between the two shots (`formatDuration` shows up to two units).
- **Outside my lane: the "Issue not found" title.** For an unknown issue (`/issues/WEB-99999` or `/issues/garbage`), Next titles the page `Issue not found`. The new app shows `Web · Ticket System`, because the 404 renders L1's error page and the project layout's title applies. The UI itself matches ("Project not found" empty state).
  - Fix in `src/routes/dashboard/projects/[id]/+error.svelte` (L1): add `{#if page.status === 404 && page.error?.message === 'Issue not found'}<svelte:head><title>Issue not found</title></svelte:head>{/if}`.
- **Outside my lane: a deprecation warning.** Changing `?issue=` from the side pane logs `replace_state_deprecated`. It comes from `src/lib/svelte/search-params.svelte.ts` (W1c).
  - Fix: replace `replaceState(url, state)` with `goto(url, { state, shallow: true, replace: true, keepFocus: true, noScroll: true })`.
- **Behaviour I left alone because React does the same.** The checks below are against the React source, not a running Next app.
  - After you choose a relation kind, focus does not move into the search box (no autofocus in React's code either).
  - The URL field in the link form has `type="url"`, so the browser blocks input that isn't a full URL.
  - j/k move the list cursor but don't change the open side pane (L3a's list logic is the same in React).
  - The due-date and label popovers run to the viewport edge when there's no room; flip and shift work the same as Radix.

### (3) Interactions checked against the React behaviour
I did these on my own test issue **WEB-45 "[L4] detail test"** with sub-issue **WEB-47 "[L4] child one"**, not on seeded issues. Changes were checked again after a reload.
- **Title:** Escape restores the old title and blurs the field; Enter saves (survives reload); clearing the title restores the old one.
- **Status:** digits 1–9 pick a state; arrow keys and Enter work; Escape closes and puts focus back on the button.
- **Priority:** typing filters the list and Enter picks.
- **Assignee:** shows "(you)" next to Alice; picks persist.
- **Labels:** clicking toggles a label and the picker stays open; both labels saved.
- **Estimate:** typing filters ("2 points").
- **Due date:** quick options and a calendar day both work; "Remove due date" appears once a date is set.
- **Start date, cycle, epic, milestone, parent:** start date and parent pickers render; cycle and epic persisted (picking an epic adds the Milestone row); milestone options list; setting the parent and "Remove parent" work; clicking the parent opens that issue.
- **Sub-issues:** the inline input gets focus, Enter creates and keeps the input open, Escape closes it; the header shows 0/1 with a progress bar; "Add existing issue" works; clicking a child navigates to it (on the issue page) or swaps the pane via `?issue=`; hover × removes it from the parent.
- **Relations:** two-step picker (kind, then issue); search filter; adding and removing both persist.
- **Attachments:** adding a link (with title) and uploading a file both persist; the meta line and hover delete work.
- **Activity:** the timeline lists every change; "Show N more" expands it.
- **Subscribe:** the popover shows the subscriber count and list with "You"; unsubscribe and re-subscribe both persist; the bell fill and aria-label update.
- **Favorite:** add persists and appears in the sidebar; removing it restored the original state.
- **Copy:** link, ID, markdown link and branch name all copy, by menu and by Ctrl+Shift+, / Ctrl+. / Ctrl+Shift+., with the same toasts as React. Copying the branch name saves it, and the Branch row appears.
- **Other shortcuts:** s, p, a, l, e and Shift+D open the command dialogs; i assigns me; Shift+A archives, shows the banner and Restore works; Ctrl+Backspace opens the trash confirmation (cancelled). Shortcuts stand down while a hover card is open, as in React.
- **Hover card, remind, move:** the "In status" hover card shows the per-state history; the remind popover and calendar render; the "Move to project" submenu opens.
- **Side pane:** opens from a row or `?issue=`; Escape and the × button close it.
- **URLs:** a lowercase key redirects to the canonical URL; an unknown key gives a 404.

### (4) Final kit-check
`scripts/kit-check.sh "src/routes/dashboard/projects/[id]/issues" src/lib/components/issue-detail src/lib/components/issue-hierarchy src/lib/components/issue-pickers` reported 0 errors.

### (5) Screenshot dirs
- Final comparison: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L4-3`, against `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/r1`
- First pass: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L4-1`
- Redirect and 404 shots: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L4-2`
- Interaction shots: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L4-int`
- Interaction scripts: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/harness/L4-*.mjs`

WEB-45 and WEB-47 are still in the project, unlinked from each other and with their attachments deleted. WEB-45 keeps the properties I set: Todo, High, assigned to Alice, labels bug and design, estimate 2, due Nov 20, cycle "Checkout beta", epic "Checkout redesign", and the saved branch name.


---

## parity:L5

Lane L5 now matches the React app on all three routes. I found and fixed one bug in my lane: deleting a document from its own page crashed instead of going back to the Docs list. I also found two bugs whose cause is outside my Svelte files, plus a few shared editor bugs that were already in the React app.

## 1. Differences found and fixed
- **`src/lib/components/documents/document-view.svelte`: delete from the doc page crashed.** After Delete in the doc's actions menu, the page threw `TypeError: Cannot read properties of undefined (reading 'projectId')` in `onDeleted` and stayed on the dead URL.
  - **Cause:** `deleteDocument`'s wrapper reloads the page first. The deleted doc now 404s, so the component is torn down and `doc` is undefined by the time `onDeleted` runs. React still had `doc` in its closure.
  - **Fix:** the list path is captured once at init (`const listPath = documentsPath(untrack(() => doc.projectId))`) and used in `onDeleted={() => void goto(listPath)}`.
  - **Re-tested:** it now goes to `/docs` and shows the "Document deleted" toast.

## 2. Differences remaining, with cause
- **Reaction picker sends focus back to its button (cause: shared popover, W1).** Open the reaction picker, then click Reply: focus returns to "Add reaction" instead of the reply box. Typed text then fires page hotkeys; "l" opened the labels palette. Radix skips refocusing the trigger after an outside click; bits-ui doesn't. This affects every popover in the app.
  - **Fix in `src/lib/components/ui/popover/popover-content.svelte`:** take `onInteractOutside` and `onCloseAutoFocus` from the props and keep a local `let interactedOutside = false`. Then pass:
    - `onInteractOutside={(e) => { onInteractOutside?.(e); if (!e.defaultPrevented) interactedOutside = true; }}`
    - `onCloseAutoFocus={(e) => { onCloseAutoFocus?.(e); if (!e.defaultPrevented && interactedOutside) e.preventDefault(); interactedOutside = false; }}`
- **Page titles (cause: app-wide convention, coordinator decision).** The Next reference titles are "Docs", "Checkout redesign spec" and "WEB-1 Set up CI pipeline for the web app". The project layout's title string drops the root template for its child pages. Kit adds " · Ticket System", following PLAN's rule, as other lanes do. Either all project sub-pages drop the suffix or none do.
- **Already in the React app, so not differences, but worth fixing in both `src/components/editor/extensions.ts` and `src/lib/components/editor/extensions.ts`:**
  - **An empty block is the editor's default content.** `Embed` has `priority: 1001`, above paragraph's 1000, so an empty editor and the auto-added block at the end of the document are an empty embed instead of a paragraph. (I confirmed in the browser that the default block type is `embed`.) Effects:
    - No placeholder ever shows. The Next reference shot of WEB-1 also has no "Leave a comment…", which suggests the React app has the same problem.
    - Text typed into a brand-new blank doc is swallowed.
    - When editing a comment, the cursor lands after the empty block, so added text becomes a new paragraph.
    - It causes the console warning "TextSelection endpoint not pointing into a node with inline content".
    - **Fix:** give `Embed` the default priority and move its paste plugin into a separate `Extension` with `priority: 1001`, so pasted links still beat the Link extension.
  - **Ctrl/⌘+Enter inserts a line break instead of submitting.** HardBreak (priority 100) handles `Mod-Enter` before `editorKeys` (priority 50).
    - **Fix:** move `Mod-Enter` and `Mod-k` into their own extension with priority above 100, and keep `Escape` at 50 so an open menu still gets it first.
- **Small and expected:**
  - Next's doc reference shot was taken mid-load ("Connecting…", dimmed preview, 8px top padding). Kit shows the same state at about 100ms, then the settled view, which matches React's logic: the seeded doc has a table the editor can't show, so it renders read-only.
  - "35d 1h" vs "35d" in the issue sidebar is just the later shot time (lane L4).
  - Next's activity section was still loading in its reference shot, so it couldn't be compared.
  - After deleting a doc, one `POST /api/collab/doc:<id>` returns 404 as the live-editing connection closes. React should behave the same.

## 3. Interactions checked against the React code
- **Issue description (on my test issue WEB-46):**
  - Markdown shortcuts work: heading, bold, italic, inline code, bullet list, checklist.
  - The slash menu lists the same 12 commands; "/code" inserts a code block.
  - @mention shows Bob Builder and inserts a mention chip; # and WEB- suggest issues and insert "WEB-2 ".
  - Content saves while typing and survives a reload. Issue keys in the read-only view become links.
  - Ticking a checkbox in the read-only description saves and survives a reload; unticking reverts it.
- **Comments:**
  - Adding a comment shows it dimmed while pending, then posted, and clears the box.
  - Reactions: the picker adds one, the tooltip says "You", it survives a reload, and clicking the chip removes it.
  - Threads: Reply opens a focused reply box and the reply lands in the thread. Deleting it shows the "This reply will be permanently deleted." dialog and the delete persists.
  - Edit shows "· edited". The actions menu has Copy link / Edit / Delete.
  - Ctrl+K opens the link field; the toolbar's pressed state tracks formatting.
  - Markdown mode: the raw editor has @mention suggestions and Ctrl+B, and switching back to the rich editor keeps the text.
  - Pasting an image uploads it as an attachment and inserts it.
- **Docs:**
  - The template menu lists Blank / Spec / RFC / Meeting notes; both "New doc" and a template open the new doc.
  - Title rename updates the breadcrumb and the browser tab title. Enter moves focus into the editor; Escape reverts unsaved title text.
  - Changing the icon saves. Edits survive a reload.
  - A second user (bob) sees edits live, and each user sees the other's avatar.
  - Archive (toast and archived banner, editor read-only) and Unarchive both work.
  - On the list: search keeps `?q=` in the URL, shows "No matching documents" when nothing matches, and Escape clears it. Active/Archived counts, archive, delete with its dialog and toast, and "No archived documents" all work.
- **Read-only markdown rendering:** headings, lists, code, mentions, issue-key links and task items match react-markdown's output and classes, and the seeded table renders.

## 4. Final kit-check
```
kit-check: 0 error(s) in src/lib/components/documents src/routes/dashboard/projects/[id]/docs
```

## 5. Screenshot dirs
- Final comparison: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L5-final`
- First pass: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L5-2`
- Interactions: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L5-int`
- Scripts: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/harness/L5-*.mjs`

**Data left behind:** issue WEB-46 "[L5] Editor parity issue" with one comment and one image attachment. All "[L5]" docs I created were deleted.


---

## parity:L6

The five L6 routes now match the Next reference shots apart from data other lanes added, and I fixed four behaviour bugs in lane files. Two problems remain, both in shared files outside my lane: a 3px gap before the Initiative "Open" link, and a deprecation warning on every filter, tab or zoom click. Final kit-check on the lane paths: 0 errors.

## 1. Fixed (lane files)

| File | Problem | Fix |
|---|---|---|
| `src/lib/components/epics/epic-list-row.svelte` | Ticking a label in the row's right-click Labels submenu did nothing and saved nothing. In bits-ui, `preventDefault()` in `onSelect` also cancels the toggle (in Radix it only keeps the menu open). | Replaced it with `closeOnSelect={false}`. Labels now toggle, save, and the menu stays open. |
| `src/lib/components/epics/add-dependency.svelte` | Adding any dependency failed with the toast "Invalid relation." `close()` resets `kind`, and the derived `{@const current}` read after it was `null`. | Read the kind into a local variable before `close()`. Add, the reverse "Blocking" entry, the schedule-conflict flag, and remove all work. |
| `src/lib/components/epics/milestone-item.svelte` | Pressing Enter on a milestone row, or clicking its name, opened the rename input without focusing it, so typing went elsewhere (once it set a target date instead). Svelte's `autofocus` only works when nothing has focus; React's `autoFocus` always focuses. | Replaced it with `{@attach (node) => node.focus()}`. |
| `src/lib/components/initiatives/initiative-detail.svelte` | Deleting an initiative threw `TypeError: Cannot read properties of undefined (reading 'slug')` and left the page on a 404. The refresh after the action unmounts the component, so props are gone after the `await`. | Read slug and ids before the `await`. It now shows "Initiative deleted" and goes to the initiatives list. |
| `src/lib/components/epics/epic-detail.svelte` | Whitespace around the Initiative "Open" link. | Tidied it. No visible change; the real cause is item 1 in section 2. |

## 2. Remaining

1. **"Open" link sits 3px too far right** on the epic detail Initiative row. A whitespace text node is rendered between `</PopoverTrigger>` and `<PopoverContent` in `src/lib/components/issue-pickers/picker-popover.svelte`; it shows wherever a picker trigger sits in a block (non-flex) container. Fix: write `</PopoverTrigger><PopoverContent` with nothing between them.
2. **Console warning `replace_state_deprecated`** on every filter, tab or zoom change. It comes from `src/lib/svelte/search-params.svelte.ts`. Fix: swap `replaceState(...)` for `goto(url, { state, shallow: true, replace: true })`, as the warning says. The URL behaviour is already correct.
3. **⌘/Ctrl+Enter doesn't submit the rich editor** in description and update editors (Markdown mode works). Both apps behave the same: in the shared `extensions.ts` (React and Svelte copies), StarterKit's hard-break extension (default priority 100) handles Mod-Enter before `editorKeys` (priority 50). Fix: give `editorKeys` a priority above 100 in both copies, or turn off the hard-break Mod-Enter binding.
4. **Tab titles differ.** Next sets "Epics", "Roadmap" and "Checkout redesign" without the suffix, because the project layout's string title drops the root template. The Kit pages, and other lanes' project pages, add " · Ticket System". Changing it in my lane alone would make it inconsistent, so I left it for a project-wide decision.
5. **Data, not defects:**
   - Checkout redesign shows 27% · 12/46 pts · 11 issues instead of 33% · 12/44 · 9, because of two `[L4]` issues another lane added. Q4 Growth's numbers follow from that (26%, 5/19, 17/79).
   - The Archived count is 1: my `[L6]` epic. There's no delete UI for epics, so I archived it.
6. **Minor:** a few anti-aliased pixels on the 100% progress ring.

## 3. Interactions checked against the React source

No console or page errors in any run.

- **Epics list:**
  - Status filters update `?status=` and work after reload.
  - "No planned epics." empty state; "Show all epics" clears the filters.
  - Label filter updates `?label=`, with counts and "Manage labels…".
  - j/k move focus between rows.
  - Right-click menu items:
    - Open
    - Copy link, with toast and the right URL
    - Labels toggle; this was the bug, now fixed
    - Archive/Unarchive, with toasts
  - Create dialog: Ctrl+Enter creates, with toast.
  - Empty states on Ops for both the epics list and the roadmap.
- **Epic detail:**
  - Tabs update `?tab=` and load from the URL.
  - "All updates" link.
  - Name: Enter saves, Escape reverts, an empty name reverts.
  - Description: Save button and Escape.
  - Status, health, lead, labels (including creating a label inline), start/target dates, initiative ("No initiative", setting one, Open link) and colour all save and survive a reload.
  - Archive banner and Unarchive.
  - Milestones:
    - add, with the input staying open for the next one
    - Alt+↑/↓ with focus kept on the row
    - menu Move up/down, with disabled states
    - rename (fixed), target date, delete, empty state
  - Dependencies: picker with Backspace stepping back, add (fixed), conflict flag, remove.
  - Updates: health toggle defaults to the current health; posting shows a toast, clears the editor and updates health and "Latest update"; deleting shows the empty state.
- **Roadmap:**
  - Zoom updates `?zoom=` and loads from the URL.
  - Today line and label.
  - Today scrolls to one third of the view on load and on zoom change.
  - Dragging a bar previews the new dates and moves by whole weeks.
  - Dragging the start edge snaps to a Monday.
  - Esc cancels a drag without saving or navigating.
  - ←/→ move a week; Shift+→ extends the target.
  - Dates persist after reload; clicking a bar opens the epic.
  - Dependency connector draws dashed red with "1 scheduling conflict".
- **Initiatives:**
  - List filters and empty state.
  - Create with Ctrl+Enter opens the new initiative, with toast.
  - Rename and Escape, status, owner, target date, description.
  - Add epic (shows "· moves" for epics already in another initiative) and remove.
  - Timeline zoom.
  - Delete confirmation, toast and redirect (fixed).
- **Epic labels dialog:** add, rename, delete with confirmation and the toast naming the label.

Not exercised:
- cross-project issues on an epic (`epic-foreign-issues`), because the seed has none
- read-only views as bob or carol
- palette commands

## 4. kit-check

`scripts/kit-check.sh src/lib/components/epics src/lib/components/initiatives src/lib/components/roadmap "src/routes/dashboard/projects/[id]/epics" "src/routes/dashboard/projects/[id]/roadmap" "src/routes/dashboard/workspaces/[slug]/initiatives"` gives **0 errors**, run after all edits.

Test data left behind: the archived `[L6] Parity epic renamed`. I put the seeded Performance and reliability labels back, removed the test dependency, milestones and update, and deleted the `[L6]` initiatives and labels.

## 5. Screenshot dirs

- Final comparison: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L6-2` (with `*.diff.png` against r1)
- First pass: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L6-1`
- Interaction shots: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L6-int`
- Scripts: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/harness/L6-*.mjs`


---

## parity:L7

I found and fixed one parity difference, in the triage Accept dialog. I found one more bug (inbox "Mark as unread"), but it is in the React app too, so I left it unchanged. The seven routes otherwise match their references, and no route logged console errors, page errors or failed requests. kit-check reports 0 errors.

### (1) Differences found and fixed
- **`src/lib/components/triage/accept-dialog.svelte`**: when the Accept dialog opened (button or key `1`), focus landed on the Status select. In React the **Accept** button gets focus, so pressing Enter accepts straight away. bits-ui focuses the first tabbable element and ignores `autofocus` here, so the dialog now passes `onOpenAutoFocus` and focuses the `[autofocus]` button. I re-ran it: focus lands on Accept, Enter gives "Accepted WEB-52".

### (2) Differences remaining, with cause
- **Inbox "Mark as unread (U)" does nothing, in both apps.** The React source has the bug and the Svelte port copies it. The toggle calls `setRead(selected, !selected.unread)`, but `setRead`'s second argument is the target read state. Opening a notification already marks it read, so the toggle never changes anything. The fix is the same one-line change in `src/components/inbox/inbox-view.tsx` (twice: `toggleSelected` and the `onToggleRead` prop) and `src/lib/components/inbox/inbox-view.svelte` (the `u` hotkey handler and `onToggleRead`): use `setRead(selected, selected.unread)`. I didn't apply it because the React source defines the behaviour.
- **Data, not defects:**
  - Current cycle shows 19 issues / 61 pts against 17 / 59 in the reference, because another lane's "[L4] …" issues are in that cycle.
  - Relative times ("16 hr. ago" vs "15 hr. ago", "2 hr. ago" vs "48 min. ago", the "In status" time) differ because time passed.
  - While I was testing, another checker had temporarily changed the project key to "WX".
- **Expected screenshot differences:** the Next dev "N" badge in the sidebar, and the sidebar background ending at 900px in full-page shots.
- **Outside my lane:** a `replaceState` deprecation warning appears when a `?draft=` link opens the new-issue dialog. It comes from `src/lib/svelte/search-params.svelte.ts`; switching to `goto(url, { state, shallow: true, replace: true })` would remove it.

### (3) Interactions checked against the React behaviour
- **Inbox:**
  - `j`/`k` move focus and the selection, and opening a notification marks it read (sidebar badge drops from 19 to 18).
  - The Unread filter keeps the open group listed.
  - The Snooze menu shows 3 presets plus a calendar starting tomorrow. "Tomorrow" shows "Snoozed until Fri, Nov 6, 9:00 AM", the row leaves and the next one opens; Undo brings it back unread, and that survives a reload. Picking the 10th gives "Tue, Nov 10, 9:00 AM".
  - `e` archives and shows "Archived" with Undo, which restores it.
  - Enter opens the issue (`/issues/WEB-40`).
  - "Mark all as read" clears every unread dot and disables the menu item. "Archive all read" shows "Archived 27 read notifications" and then the "Inbox zero" empty state.
  - Everything was reverted afterwards (15 unread, badge 19).
- **Triage** (on three "[L7]" issues I created):
  - `j`/`k`, ↑/↓ and row focus work.
  - Accept dialog: default state Backlog, priority set to High, assignee Bob; the change persisted, "Accepted WEB-51" showed, and the next issue was selected.
  - Decline: `3` opens it, Ctrl+Enter submits the reason, "Declined …" shows, and the reason is cleared when reopened.
  - Duplicate: `2` opens a search with the placeholder "WEB-49 is a duplicate of…"; picking a result gives "Marked WEB-49 as a duplicate of WEB-51" and moves the issue to the Duplicate state.
  - All test issues were deleted afterwards.
- **Cycles:**
  - Velocity Issues/Points toggle and bar tooltip work.
  - New cycle dialog: name field focused, suggested dates 12/07–12/20. Overlapping dates show the field error "These dates overlap Search and scale." and nothing is created.
  - Clicking a row opens the cycle.
  - Cycle detail (current cycle "Checkout beta"; the completed cycle on my route only got a screenshot): burndown hover tooltip and unit toggle, Assignees/Labels tabs.
  - Complete cycle dialog: text and rollover choices shown, then cancelled.
  - Edit on Cycle 4: renaming shows "Cycle updated", then I reverted the name.
- **Drafts** (as bob, so the seeded draft was untouched): the per-row trash icon appears on hover and deletes; "Discard all" confirm text and Cancel; Discard all shows "Discarded all drafts" and leaves no scroll lock; a draft link opens the new-issue dialog with the draft loaded.
- **Templates:** `/dashboard/templates` matches its reference (its manager component is another lane's). On settings → Templates:
  - Create with a High priority chip, edit, the row menu ("Create issue" link with `?template=`), and delete with confirm all show the React toasts.
  - The new-issue "Template" menu lists the templates; applying "Bug report" fills the title "[Bug]", High and the bug label. Draft autosave shows "Draft saved", and Discard removes the draft.
- **Issue command dialog:** `a` on a focused issue row opens "Assign to — WEB-40", and Esc returns focus to the row.
- **Recurring editor:**
  - Title field gets focus on open; weekday toggles and "every 2" update the preview.
  - "every 0" shows "Repeat every 1 to 12." and disables Create.
  - Monthly on day 31 shows the shorter-month hint and its preview; switching to Daily hides the weekday row.
  - Create, Pause (row shows "Paused" at 70% opacity), Resume, "Create issue now" ("Created WEB-54" with an Open action), Edit and Delete all show the React toasts.
  - Opening the page also creates any due issue, as React does (WEB-53). I deleted both created issues and archived the notification they produced.
- Settings pages that use lane components (planning, automations, notifications) also match their references, apart from times.

### (4) kit-check
Run on every L7 Svelte target (`src/lib/components/{cycles,triage,inbox,recurring,productivity}` and the six route dirs): **0 errors**.

### (5) Screenshot dirs
- Final comparison: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L7-3` (against `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/r1`)
- First pass: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L7-1`
- Settings pages: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L7-2`
- Interaction shots: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L7-int`
- Scripts: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/harness/L7-*.mjs`


---

## parity:L8

## L8 parity report: project settings

All 14 routes load in the new app with 0 console or page errors. After my fixes, the viewport screenshots match the Next references pixel for pixel except for data and environment differences, and every page title matches Next. kit-check reports 0 errors on my paths.

Two things to know first:
- **The Web project's issue key was briefly WX.** My key-error test typed "WX", which is a valid 2-letter key, so "Change key" applied it. I changed it back to WEB within about a minute and confirmed it after a reload. Other lanes may have seen `WX-…` issue IDs during that minute.
- **One test issue is left in Web:** "[L8] import test" (Todo, High, label bug), created by the CSV import test. Everything else I changed was reverted.

### (1) Differences found and fixed
- **Name field not focused when an editor opens** (`src/lib/components/settings/workflow/state-editor.svelte`, `src/lib/components/settings/labels/label-editor.svelte`, `src/lib/components/project-templates/template-form.svelte`).
  - React's `autoFocus` always focuses the field when it appears. Svelte's `autofocus` only does so when nothing else has focus.
  - So after clicking "+" / "New label", focus stayed on that button, and typed text and Enter went nowhere. In create mode on /dashboard/templates, focus landed on the project picker instead of Name.
  - Replaced `autofocus` with `{@attach focusOnMount}` (`node.focus()`). Verified: focus now lands on "State name", "Label name" and `#template-name`.
- **Page titles** (all 14 `src/routes/dashboard/projects/[id]/settings/*/+page.svelte`).
  - Next applies no " · Ticket System" suffix below the project layout: it shows "Automations", "Settings · Web" and so on.
  - Dropped the suffix on these pages; all 14 titles now match the Next logs.

### (2) Differences remaining
- **The same focus bug exists across the app.** 39 Svelte files use `autofocus`. The fix belongs in `src/lib/components/ui/input/input.svelte` and `textarea/textarea.svelte` (W1a): take `autofocus` out of `restProps` and call `ref?.focus()` on mount when it is set.
- **Other project pages still add " · Ticket System" where Next doesn't.** Drop it from the `<title>` in each of these, under `src/routes/dashboard/projects/[id]/`:
  - views, views/[viewId]
  - archive, trash, roadmap, triage
  - customers, customers/[customerId]
  - cycles, cycles/[cycleId]
  - docs, docs/[docId]
  - epics, epics/[epicId]
  - settings/recurring (L7)
  - issues/[key]: its title still gets the suffix from somewhere.
  - Keep the suffix only in the project `+layout.svelte`.
- **"api scope" on the developer page.** Next renders "the apiscope" because its compiler dropped the space in `<Mono>api</Mono> scope` (the compiled `.next` chunk has `"scope, …"`). The React source has the space, so I kept "api scope" rather than copy the compiler bug.
- **Expected, not defects:**
  - port 3000 vs 5173 in the intake, developer and GitHub URLs
  - relative times ("Last run 49 min. ago")
  - issue and label counts, audit rows and inbox count changed by other lanes' data
  - slight anti-aliasing differences in lucide icons
- **Select icon colour (W1b primitive):** in the GitHub state dropdown, the icon of the focused item takes the muted colour. I did not compare this against Radix.

### (3) Interactions checked against the React behaviour
- **Workflow:** add state (toast, saved after reload), rename, Escape closes the editor, duplicate name shows an inline error with `aria-invalid`, move up/down (spinner, saved after reload), delete with no issues, the move-issues dialog, and the blocked dialogs for the last completed state and for triage while triage is on.
- **Labels:** create (toast, list sorted), duplicate error that clears as you type, filter by name or description including the no-match row, inline edit, delete dialog (closes, toast).
- **General:**
  - Save changes: pending spinner (checked with delayed requests), toast, saved after reload, empty name shows an inline error.
  - Key: input is uppercased and filtered, the warning appears.
  - Parent and visibility: options are correct and the save buttons enable only when the value changes.
  - Danger zone (opened, not run): confirm is disabled until the name matches, and the field resets when reopened.
  - "Save as template" dialog (opened only, nothing saved).
- **Templates manager** (/dashboard/templates): create, edit and delete dialogs (opened, then cancelled).
- **Developer:**
  - GitLab connect: an unreachable URL shows the error callout.
  - Sentry: connect, Replace secret / Cancel, copy URL (clipboard and check icon), disconnect dialog and toast.
- **GitHub:**
  - `?error=` link callout.
  - PR automation select: saves optimistically, toast, saved after reload, reverted.
  - "Connect GitHub" starts the OAuth redirect; I blocked it there.
- **Import / export:**
  - Export links; the JSON export downloads as an attachment.
  - All tabs render.
  - CSV import: column mapping, "Map a column to Title", preview with skipped-row count, import with toast, result screen, "Import more".
  - Asana and Shortcut token forms show the pending state. No result came back within 6 s, probably because the server can't reach those services.
- **Other lanes' pages, quick checks:**
  - SLA save, saved after reload, reverted; Apply dialog (L3a).
  - Planning switch save and revert (L7).
  - Issue-template dialog (L7).
  - Members invite and revoke; role change, saved after reload, reverted (L2).
  - Intake rotate dialog (cancelled), copy, open link. I did not toggle intake on/off because that rotates the seeded token (L9a).
  - Slack URL validation error, add-webhook form (L9a).
  - Audit actor and issue filters, URL params, CSV link (L9a).

### (4) kit-check
`scripts/kit-check.sh src/lib/components/{settings,project-templates,import,developer,github} "src/routes/dashboard/projects/[id]/settings"` → **0 errors**

### (5) Screenshot folders
- Final comparison: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L8-3`
- First pass: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L8-1`
- /dashboard/templates and user settings pages: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L8-2`
- Interaction screenshots: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L8-int`
- Side-by-side crops: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L8-cmp`
- Test scripts: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/harness/L8-*.mjs`


---

## parity:L9a

# L9a parity check: workspaces, audit, customers, account settings

All 8 routes match their `.next.png` references in layout, spacing, type, colours, icons and borders. I found and fixed one bug in my lane's files. kit-check reports 0 errors for my paths. No route logged console errors, page errors or failed requests.

## (1) Differences found and fixed

- **`src/lib/components/workspaces/workspace-create-project-dialog.svelte`**: the "Ticket key" field didn't clean up what you typed. The text you saw stayed raw: typing `ab1c-defgh` showed `ab1c-defgh` instead of `ABCDEF`. React shows the cleaned value (uppercase, letters only, at most 6). The cause was a getter/setter `bind:value` passed through the `Input` primitive, which never writes the cleaned value back into the field. I changed it to `value={ticketKey}` plus an `oninput` handler that cleans the value, stores it and writes it back with `event.currentTarget.value = ticketKey` (the same approach L1's `create-project-dialog.svelte` uses).
- **`src/lib/components/workspaces/create-workspace-dialog.svelte`**: the URL slug field had the same bug and got the same fix.
- Checked again in the new app: `ab1c-defgh` becomes `ABCDEF`, and Backspace gives `ABCDE`. The name `My Team!` fills the slug as `my-team`. Typing `X_Y z` on the end gives `my-teamxyz`. Once the slug has been edited, changing the name no longer updates it, as in React.

## (2) Differences remaining

**Data, not defects:**
- Web shows 30 open issues instead of 26.
- The audit log rows are newer because other lanes created `[L6]`/`[L8]` events.
- The Slack request URLs use port 5173 instead of 3000, because they are built from the server's own address.

**Causes outside my lane:**
- **L8, `src/lib/components/settings/project-key-form.svelte` (around line 38):** same input bug, confirmed in the browser. Typing `1x` after `WEB` shows `WEB1x`. Fix: replace the getter/setter `bind:value` with `value={value}` and `oninput={(e) => { value = e.currentTarget.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6); e.currentTarget.value = value; }}`.
- **Shared `src/lib/svelte/search-params.svelte` (W1c):** changing customer filters logs a SvelteKit warning that `replaceState` is deprecated. Fix: call `goto(url, { replace: true, shallow: true, state })` or `replaceState` from `$app/navigation` instead.
- **L5, shared editor (`src/lib/components/editor/extensions.ts`):** in the customer notes editor, Ctrl+Enter does not save; Esc does cancel. Tiptap's built-in hard-break shortcut also uses Mod-Enter and runs first, because `editorKeys` has lower priority (50). The React app uses the same file and the same Tiptap version, so it probably behaves the same; I couldn't confirm because the old app isn't running. If "⌘Enter to save" is meant to work, give `editorKeys` a priority above 100 in both copies of `extensions.ts`.

**Unavoidable:** in full-page captures the sidebar background stops at the viewport height. This is a capture artifact, not a page difference.

## (3) Interactions checked against the React code

- **Workspace page as Alice (owner):**
  - **Invite dialog:** the email field gets focus. Invite is disabled while the field is blank, and the server error appears in the dialog ("Carol Chen is already a member.") and clears when you type. Closing the dialog resets it.
  - **Inviting a new email as Admin:** you get the "Invitation created" toast with a Copy link button, which copies the link. The new row appears, then Revoke removes it.
  - **Invitation and member menus:** they have the expected items, and Copy invite link works.
  - **Role select:** while saving it stays on the old role and is disabled along with the ••• menu, then shows the new role with a "… is now admin" toast. I set Carol back to Member.
  - **Other dialogs and menus:** the workspace, Ops and Web menus have the expected items. Add project shows its empty-list message. New project shows the server's duplicate-key error and the two template options.
- **Workspace page as Carol (member):** only Initiatives and New project show; roles appear as chips. The audit page shows the "Admins only" empty state with the member subtitle.
- **Audit log:**
  - The actor and event-type filters (including "System & integrations") update the URL and the rows, and the empty state shows when nothing matches.
  - Clear works. The issue key is uppercased and applied on Enter. The From date sets the To field's minimum, and focus stays in place.
  - The CSV and JSON links carry the filters, return 200 with an attachment header, and clicking CSV downloads `acme-audit-log-2026-11-05.csv`.
  - "Older events" goes to the next page, which shows "Newest".
- **Customers list:**
  - Search filters the rows and Esc clears it. The status and tier filters update the URL, clicking the active status doesn't deselect it, and filters survive a reload.
  - Column sorting toggles direction and leaves default values out of the URL.
  - j/k move focus between rows and Enter opens the focused one. The right-click menu has Open, Copy link, Edit… and Delete…, and Copy link shows its toast.
- **Customer create → detail → delete**, on a customer I created as `[L9a] Test Co` and deleted at the end:
  - A bad revenue value is flagged and Ctrl+Enter submits the form. Creating the customer shows a toast and opens its page.
  - Status changes appear immediately and survive a reload. The owner picker works, and Edit opens with the current values and saves with a toast.
  - Notes save with the Save button and Esc cancels. Delete asks for confirmation with focus on Cancel, then returns to the list with a toast.
- **Customer detail (Globex):** the requests timeline and the 3 linked issues match the reference exactly. I didn't press Unlink on seeded requests.
- **Appearance:** Light, Dark and System each change the page theme and survive a reload. Compact density works and survives a reload, and the arrow keys move between options. Reset to Dark/Comfortable at the end.
- **Notifications:**
  - Notification-type switches save and survive a reload.
  - Turning email off disables the digest select. The digest choice (Off, Daily, Weekly) saves and survives a reload.
  - Send test email shows the "not configured" warning toast.
  - Everything is reset to how it was.
- **Profile:** an empty name shows "Name is required.", saving shows "Profile saved", the title change was reverted, and "Use this device's" fills in the browser's timezone.
- **Slack:** the four URL copy buttons and the manifest copy button show their toasts. "Add to Slack" and "Link my Slack account" are disabled because Slack isn't configured. The setup section can be collapsed. The success, known-error and unknown-error messages from the URL all display correctly.

## (4) kit-check

`scripts/kit-check.sh` on every L9a path (src/lib/components/{workspaces,customers,integrations,slack,audit} plus the workspace, customers, members and settings routes): **0 errors**.

## (5) Screenshot folders
- Final route comparison: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L9a-1` (re-shot after the fix: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L9a-2`)
- Signed in as Carol: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L9a-carol`
- Interaction captures: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L9a-int`
- 404 pages: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L9a-404`
- Test scripts: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/harness/L9a-*.mjs`


---

## parity:L9b

## L9b parity report: dashboards, insights and charts

The lane is at parity with the React app. I found one defect and fixed it (page titles on two routes). Every focus interaction behaves the same as the React source, and none of the runs logged console errors, page errors or failed requests.

### (1) Differences found and fixed
- **`src/routes/dashboard/dashboards/+page.svelte`**: the title was `Dashboards` / `Pulse`. It is now `Dashboards · Ticket System` / `Pulse · Ticket System`, matching the Next reference and the `%s · Ticket System` template in PLAN.md.
- **`src/routes/dashboard/dashboards/[dashboardId]/+page.svelte`**: the title was `{name || 'Dashboard'}`. It is now `{name ?? 'Dashboard'} · Ticket System`, which gives `Web team overview · Ticket System` as in the reference.
- The insights route keeps the title `Insights` on purpose. The Next reference shows plain `Insights`, because the project layout's metadata is a plain string, so the root template doesn't apply under `/dashboard/projects/[id]`.

### (2) Differences remaining
- **Counts differ only because other lanes added `[Lx]` issues.** Examples: Open issues 26→30, Created 40→44, status bars, Recently updated rows, and cycle 24%→21%. Layout, spacing, typography, colours, icons and ordering match pixel for pixel in all three viewport shots.
- **These look odd but appear the same in the Next reference, so they are not defects:**
  - The "Urgent and high" number equals the total of open issues (26=26 in Next, 30=30 in kit).
  - The x-axis labels "Oct 26" and "Nov 2" overlap in the dashboard's line widget.
  - The cause is shared code or seed data, not lane Svelte files.
- **Out-of-lane observation (not mine to fix):** under `/dashboard/projects/[id]`, Next renders titles without the ` · Ticket System` suffix (e.g. "Cycles", "Epics", "Customers", "Views", "Trash", "Archive", and the cycle detail "Checkout foundations"). Several kit project routes add the suffix, for example:
  - `src/routes/dashboard/projects/[id]/cycles/…` → `Cycles · Ticket System`
  - the cycle detail page → `Checkout foundations · Ticket System`
  - epics, customers, views, archive and trash pages

  The fix is to drop the ` · Ticket System` suffix in those routes' `<svelte:head><title>`.

### (3) Interactions checked against the React behaviour
- **Dashboards list:**
  - Sections, rows and the actions menu (Duplicate, plus Delete… for the owner) match.
  - Duplicate from the list goes to the copy with no toast, as in React.
  - The delete alert text includes "Project members will lose access too." when the dashboard is shared.
  - Delete shows a "Dashboard deleted" toast and removes the row in place.
  - As bob (not the owner), the list shows only "Shared with you", with the owner name.
- **New dashboard dialog:**
  - The name field gets autofocus.
  - The Scope select works.
  - Create goes to `/dashboard/dashboards/<id>` with 4 starter widgets.
- **Adding and editing widgets:**
  - I added all 7 types (number, bar, line, list, cycle, epic, time in status). Each one is added immediately and the editor opens with its default title.
  - The editor's "N issues match" description is correct.
  - Group by offers no "Project" option on a single-project dashboard. The list widget's Show options are 5/10/20/50.
  - A blank title falls back to the type label ("Number").
  - Cancel and Esc close the editor without saving.
  - Everything persists after reload.
- **Widget menu:**
  - It is hidden until you hover the card (opacity 0→1).
  - Items: Edit…, Size submenu with radios (current size checked), Move earlier/later, Duplicate (inserts "(copy)" right after), Remove.
  - Resizing to Full width applies the `xl:col-span-4 row-span-2` classes and persists. The new order also persists.
- **Dashboard header:**
  - Rename… opens prefilled; the h1 and the tab title update and the dialog closes.
  - The Shared switch shows the "Shared with project members" toast and persists.
  - Duplicate shows "Dashboard duplicated" and goes to "(copy)".
  - Delete… then confirm shows "Dashboard deleted" and goes to `/dashboard/dashboards`.
- **Other dashboards:**
  - As bob, the dashboard view shows "· shared by Alice Example", with no Add widget, no switch, titles that aren't buttons, and a menu with only Duplicate.
  - The cross-project "My work" dashboard: the editor shows a Project select (All projects / Ops / Web).
- **Insights charts:**
  - Hover tooltips work on the trend chart ("Week of Nov 2 · 16 created · 2 completed", with crosshair and dots) and on the throughput columns (highlighted column, "Week of Oct 5 · 5 completed").
  - Keyboard: focus selects the last point, ←/→ step, and blur clears.
  - The legends and end labels are drawn.
  - Resizing to 900px re-measures the chart (SVG width 1118→578).
- **Insights filters:**
  - The range select sets `?range=4`, replaces the history entry and keeps the scroll position.
  - The label select sets `&label=<id>` and the trigger shows the label. "All labels" removes the parameter.
- **Shared chart components (`charts/*`), tested on the cycle page:**
  - The cycle detail burndown matches the Next shot exactly.
  - The hover tooltip works, as do End/Home/→/Esc.
- **Pulse tab:** renders correctly. There was no Next reference shot for it; I checked it against `pulse-feed.tsx`.
- **Test data:** everything I created has been deleted (`[L9b] Test board`/`Renamed board` and its copies). No seeded data was changed.

### (4) kit-check
`scripts/kit-check.sh src/lib/components/dashboards src/lib/components/insights src/lib/components/charts src/routes/dashboard/dashboards "src/routes/dashboard/projects/[id]/insights"` reports **0 errors**.

### (5) Screenshot directories
- Final comparison: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L9b-2` (my 3 routes, plus the cycle detail and `?tab=pulse`)
- First pass: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L9b-1`
- Interactions (full pages, hovers, menus, dialogs): `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/shots/L9b-int`
- Scripts: `/tmp/claude-1000/-home-oscar-Projects/b8b383a2-2ce3-4703-a66d-7c6218674fd0/scratchpad/harness/L9b-*.mjs`