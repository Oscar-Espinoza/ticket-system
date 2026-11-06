# Untangle report — ticket-system, Claude Code arm

Branch `untangle/claude`, from `untangle/base` (5319149). 17 commits, ~850 files touched
(`git diff --shortstat untangle/base..HEAD`: ≈ +7.9k / −7.8k lines). Step 1 answers given by the coordinator:
**Comments: yes. Tests: no** (tests were only updated mechanically: import paths, mocks of removed shim exports).

Companion files: `inventory/*.md` (step 2, 7 areas), `decision-log.md` (fixes with the problems they solve,
and the status of every inventory finding).

## 1. Structural special cases, before → after

Counted with a TypeScript-AST script over `src/**/*.ts` and the `<script>` blocks of `.svelte` files, excluding
generated wrappers (`src/lib/remote`, `src/lib/actions`), migrations and tests. Only the structural categories from
the addendum are counted, not lexical comparisons.

| Category | How counted | Base | HEAD |
|---|---|---:|---:|
| Silent catches | `catch {}` / `catch` returning a literal / `.catch(() => literal)` | 96 | 76 |
| Module-identity branches | `===`/`!==`/`case` against a known module or feature id (`'gitlab'`, `'epic'`, `'board'`, `'sentry'`, …) in a file whose path does not contain that id | 58 | 43 |
| Copied constants | the same `UPPER_CASE = literal` defined in two or more files | 24 | 10 |
| Single-caller parameters | exported function whose optional parameters are passed by exactly one call site | 23 | 27 |
| Timer workarounds | `setTimeout(≤200 ms)`, `requestAnimationFrame`, `queueMicrotask`, sleep or retry calls, plus the named helpers `afterFrame`/`afterTask`/`runLater`/`abortableSleep` | 20 | 21 |

Reading the numbers:
- **Copied constants (24 → 10).** All 10 left are coincidental same-name limits for *different* entities, for
  example `NAME_MAX=60` for API keys, templates and workspaces, or UI sentinels like `ALL='all'`. None of them has
  to change together. Every real copy is now one definition: `DAY_MS`, `TITLE_MAX`, `LABEL_NAME_MAX`,
  `LABELS_MAX`, the search marks, the presence heartbeat, `MAX_BODY`, `FORM_OVERHEAD`, the chip class, the
  timeline column width, the calendar drop ids, `MAX_DEPTH`, `TTL_MS` and `COLOR_RE`.
- **Identity branches (58 → 43).** What remains is mostly filter- and group-key dispatch (`case 'cycle'` and
  `case 'epic'` in the filter language), the workflow `'triage'` state-type rule, the database driver choice
  (`'pg'`/`'neon'`) and SSO kinds inside the SSO module. These follow from the domain. Gone:
  - the provider branches in shared developer actions and UI (now a host registry and descriptor tables);
  - the layout-id branches in the display menu and view host (now capabilities on the view registry);
  - the closed-state literals.
- **Silent catches (96 → 76).** 5 catches that hid real failures now log. The rest are best-effort UI
  parsing and storage. Many are now in the shared `storage.ts`, `json-body.ts` and `secrets.ts` helpers instead
  of copied per file.
- **Timers (20 → 21): not reduced.** None of the focus waits could be proven unnecessary, so every one was kept.
  They now go through `src/lib/svelte/focus.ts`, so the workaround is named in one place. The counter also
  counts the helper's own definitions.
- **Single-caller parameters (23 → 27): went up.** A few new helpers have one optional parameter: an
  exclude-id on the label duplicate check, a replace option on `insertNotifications`, and a row tag on
  `focusIssueRow`. Most of the base ones remain. They were not part of the fix list (see §4).

## 2. Dependency graph, before → after

Script: file-level graph of value imports (type-only imports excluded) over `src/**/*.{ts,svelte}`.

| Measure | Base | HEAD |
|---|---:|---:|
| Files / value-import edges | 1200 / 3991 | 1253 / 4280 |
| Import cycles (SCCs > 1 file) | 1 (`issue-filtering` ↔ `issue-model`) | **0** |
| Layer violations: server/lib code importing `src/lib/components` or `src/routes`, or anything importing a server-action module except the generated wrappers | 35 | **1** (`server/outbox-actions.ts` → `server/actions/tickets.ts`, server-only replay registry; legitimate) |
| Edges `lib/*` (non-UI) → `components/*` | 32 | **0** |
| Edges `routes/*` → `lib/db` | 36 | 10 |
| Fan-in of the Next.js shim `kit/request.ts` | 74 (7th most imported) | out of the top 8 (only `cache`/`after`/`headers` remain) |
| Type-only parent↔child component cycles | 17 | 0 (shared types in sibling `*-types.ts`) |

Server code no longer depends on UI folders: domain models live in `src/lib`. Routes go through lib reads, and
REST no longer imports from `graphql/`. The edge count rose because shared modules are now imported where copies
used to be.

## 3. Fixes done

The full list is in `decision-log.md`. Of the 170 inventory findings, 85 are fixed, 39 partly fixed and 46
skipped with a reason (counts per inventory are in the log). Summary:

| Fix | What changed |
|---|---|
| F1 Domain models with their domain | 14 React-free models moved from `components/` to `src/lib`; role rules merged into `roles.ts`; one `relativeTime` |
| F2 One action result contract | `server/action-kit` (ActionResult, fail, sentinels, text checks), `db-errors`, `colors`, `text` |
| F3 One refresh marker | `refreshesData()`; the no-op `revalidatePath`/`revalidateTag` shim and its regex bait are gone; 154/209 actions refresh, identical per export |
| F4 One tenant/role rule | `projectMemberOf`, `getMemberProject`, `workspaceRoleAllows` + workspace role-assignment rules (shared by UI and server), `rolesAllowing`, `authorizeWorkspaceAction`, `checkProjectAccess` (REST + GraphQL) |
| F5 Guard once, one session path | hook covers `__data.json`; `requireUser`/`requireSession` replace 49 copies; `getSession()` reads `locals`; `loadViewerProject`; `parent()` for layout data |
| F6 Workflow/issue rules once | closed/open state helpers, `projectStatesQuery`, duplicate-state rule, `parseIssueKey`/`formatIssueKey`, `sla-server`, `issueDocument` fragment, `weekRange`; dead `issue-model` re-exports (the only value cycle) removed |
| F7 Provider-neutral VCS | PR engine in `vcs/`, `webhook-url`, host registry, one request-noun table, UI descriptors |
| F8 Secrets/crypto home | `server/crypto` (encrypt/decrypt) + `server/secrets` (safeEqual, HMAC, appSecret) |
| F9 One notification entry | `insertNotifications`/`deliverNotifications` with per-type channel rules; `event-names.ts` |
| F10 Values two sides share | time, password length, label limits, ids, search marks, presence, insights types, timeouts, Slack constants |
| F11 UI contracts named | issue-dom, picker option builders, bulk-actions, view capabilities, chip/calendar/timeline/board constants, `actionErrorText`, debounce/storage/focus/cached-loader/clipboard helpers, `pluralize` and date formats |
| F12 Reads through lib | 27 page loads use lib read modules (gates stay in the route); template pages use lib DAL instead of remote-command modules; `routes/api/_lib/http.ts` |
| F13 Sibling type modules | 17 type-only component cycles removed |
| F14 Surplus | dead files and exports (about 30), Next shim leftovers, `search-param.ts`, `CookieResponse`; density boot script injected from `density.ts` (byte-identical HTML) |
| F15 Comments | 193 → 1 "Port of src/…" provenance lines; lane/ticket tags, section banners and restating comments removed in touched files; the wrong cookie-cache comment fixed |

### Skipped

These are listed in `decision-log.md` with reasons.
- **Owner sign-off.** These are shared UI shells, or user-visible changes:
  - issue property registry across row/table/card/detail;
  - generic optimistic-list helper;
  - generic epic/initiative component set;
  - chart toolkit merge;
  - settings form shell;
  - unifying the issue selector sets;
  - the two user-agent classifiers and the two CopyFields;
  - `appSecret` throwing in production;
  - SLA/pulse/recurring email;
  - lazy automation/recurring runs in GET loads;
  - removing the `NEXT_PUBLIC_*` env fallbacks.
- **Data migration needed:** renaming the stored `github.*` event types; a nullable `workspace_id` on audit
  activity; deriving project and workspace ownership from one source.
- **Larger redesigns, not attempted:**
  - GraphQL loader-level authorization;
  - the CSRF exempt-list redesign;
  - per-route OPTIONS handlers;
  - merging the four filter evaluators;
  - durability of the `after()` subscribers;
  - the issue field table;
  - one invitation module;
  - Better Auth plugin contract tests.

### Leftovers from the last review round, not fixed (budget of 3 rounds reached)

`decision-log.md` covers the leftovers from earlier rounds. The final review round found no regressions. These are
its remaining small structural items:
- `views.ts`: `skeletonColumnClass` should be part of a `loading` union.
- `board-layout.ts`: the 12 px link to the board cell's padding is not named.
- `app-shell/slots` and `project/slots` are not flattened.
- `initiatives.ts`: `linkedEpicIds` is built twice.
- `project-settings-read.ts` hosts `getAdminProjects` and `getCycleSettings`, which belong elsewhere.
- `runOutboxAction` has a single caller.
- `lib/labels.ts`: `updateLabel` relies on callers running `labelNameTaken` first. This is now documented and
  kept, because moving the check inside would change which error wins when the colour is also invalid.
- Single-caller parameters: see §1.

## 4. Behaviour changes

| # | Change | Class |
|---|---|---|
| 1 | Project invite, workspace invite and members-page links are built with `appUrl()`, so they are absolute when `PUBLIC_APP_URL` is unset (they were relative) | allowed — bug fix |
| 2 | GitHub webhook base URL: `GITHUB_WEBHOOK_BASE_URL ?? appUrl()` (adds the `BETTER_AUTH_URL`/Vercel fallbacks GitLab/Bitbucket/Sentry already had) | allowed — bug fix |
| 3 | The import's GitHub client goes through `octokitFor` (10 s timeout, user agent; none before) | allowed — bug fix |
| 4 | Signed-out `__data.json` requests under `/dashboard` get the `/login` redirect from the hook instead of from each page (same target, same JSON redirect) | allowed — same visible result |
| 5 | Pages that read layout data via `parent()` declare that dependency (`uses.parent`), so the project layout load (incl. its daily-throttled `after(runProjectAutomations)`) also runs on their page-only requests | allowed — invisible to users |
| 6 | Initiative actions accept the workspace **id** only (they also accepted a slug); every UI caller sends ids | allowed — not reachable from the UI |
| 7 | Document actions answer a signed-out caller "Not authenticated" before looking the document up (base answered "Document not found." for unknown ids, which leaked existence) | allowed — bug fix, only direct remote calls |
| 8 | `parseIssueKey` has no `{1,10}` prefix cap (project keys are 2–6 letters, so results are identical) | must be invisible — is |
| 9 | Unique-violation detection walks the whole `cause` chain; `fail()` omits an undefined `field` key | must be invisible — is |
| 10 | 5 silent catches now `console.error` (same return values) | allowed |
| 11 | Pulse notification inserts are one batch; `ensureUpcomingCycles` makes one query instead of two; cross-project epics filtered in SQL; Slack loads actor names for all live rows | must be invisible — is (same rows) |
| 12 | Slack OAuth nonce cookie set via `event.cookies` (Set-Cookie headers byte-identical) | must be invisible — is |
| 13 | `app.html` density boot script injected from `density.ts` (served HTML byte-identical) | must be invisible — is |
| 14 | Dead code, keys and files removed (about 30 exports or files, each proven unused against dynamic lookups) | allowed |
| — | No storage keys, encodings or stored event types were renamed; no validation bound or message moved without keeping its value | — |

**For owner sign-off, not shipped (old behaviour kept):**
- Should `appSecret()` throw in production when `BETTER_AUTH_SECRET` is missing? Today the intake and Slack-state
  signatures fall back to public dev strings.
- Should SLA-breach, recurring-created and pulse notifications send email? They don't today. This is now explicit
  in the rules table in `notifications/create.ts`.
- Calendar chips are excluded from selection, the context menu and shortcuts, and table and timeline rows trigger
  list-only behaviours (Space peek, the `s` guard). The selector sets are kept as they were and named in `issue-dom.ts`.
- The two user-agent classifiers (push settings vs. the sessions list) and the two CopyFields differ in wording.
- `createCycle` reports "someone created one at the same moment" for any insert failure.
- The lazy automation and recurring runs inside GET loads.
- Removing the `NEXT_PUBLIC_*` env fallbacks would break old self-host `.env` files.

## 5. Behaviour verification

Baseline gates were measured on the untouched base first:

| Gate | Base | HEAD |
|---|---|---|
| `npm run check` | 0 errors, 7 warnings | 0 errors, 7 warnings |
| `npm run lint` | 0 errors, 157 warnings | 0 errors, ~158 warnings (+svelte "unused ignore" on spread attributes) |
| `npm run build` | pass | pass |
| `npx vitest run` (with local `.env.local`) | 115 pass, 4 fail, 20 skip | 115 pass, 4 fail, 20 skip — identical; the 4 are `auth.test.ts`, failing on base too with `request_event_unavailable` (Better Auth's `sveltekitCookies` plugin needs a request event outside Kit) |
| DB tests `src/tests/local-db` (local Postgres :55441) | 20 pass | 20 pass |

Beyond the gates:
- **Differential logic harness.** It lives outside the repo (scratchpad `harness/`). With a seed it drives
  65 pure-logic targets in BASE and HEAD in lock-step: 263 functions, about 28,000 cases plus constant
  snapshots. Rejections count as output.
  - Self-test: 17 planted mutations, all caught.
  - It ran after every wave and fix round. It caught one regression the editors missed (`prNoun` threw on an
    unknown provider after the noun-table refactor; fixed before commit).
  - Final run: `OK: 28021 comparisons, 0 mismatches`. Target paths and aliases were updated for moved modules,
    and dead exports were dropped from the targets with a note.
- **Seeded end-to-end crawl, base build vs HEAD build.** Both production builds ran in turn on :3511 against the
  same local DB, seeded with `seed-dev.test.ts`. For each of the 64 routes in `docs/migration/CRAWL_ROUTES.txt`,
  the crawler fetched four responses: page signed-out, `__data.json` signed-out, page signed-in, `__data.json`
  signed-in. Bodies were normalised for build hashes, ids, timestamps and relative times.
  - Statuses and redirects are identical.
  - The only body differences are:
    - `uses.parent` in the data of pages that now call `parent()`;
    - one Svelte if-block marker index (same rendered SVG);
    - the session list on the security page, which also differs between two base runs.
- **Generated wrappers.** The refresh-after-write set was proven identical per export at every change to the
  generator or the actions: 154 of 209.
- **Reviews.** Three rounds of fresh reviewers that did not write the code, reporting regressions and leftovers
  separately:
  - Round 1 found 2 low regressions. One was reverted (notification ordering), the other accepted (#6).
  - Rounds 2 and 3 found 0 regressions.
- **Not verified:** no interactive browser session. Click, drag, focus and keyboard behaviour were checked only
  by reading and by reviewers. The seeded crawl checks SSR output and load data, not client interactions.

## 6. Subagents used

| Model (agent type) | Effort | Count | Role |
|---|---|---:|---|
| Opus 5.5 (lead, this session) | default | 1 | plan, wave 0 (model moves and contract modules by script), shared-module design, merges, gates, harness and crawl runs, commits, report |
| Sonnet 5.5 `sonnet-mid` | medium | 17 | harness builder (1); inventory for issue-core, domain, issue-UI, other-UI, routes (5); wave-1 editors E2, E3a, E5, E6 (4); round-1/2 UI fixers (2); UI reviewers in rounds 1–3 (3); decision-log writer (1); final cleanup (1) |
| Sonnet 5.5 `sonnet-high` | high | 12 | inventory for auth/tenancy and integrations (2); wave-1 editors E1 actions, E3b auth/routes, E4 integrations (3); wave-2 cross-owner sweep (1); round-1/2 server fixers and round-2 routes fixer (3); server reviewers in rounds 1–3 (3) |
| Opus 5.5 `opus-medium` | medium | 1 | round-1 cross-module contract review |
| Haiku 5.5 | — | 0 | not used: the skeleton and dependency graph were scripted, and inventory needed judgment |

- **Subagent tokens:** about 5.6M in total, from the per-agent usage the harness reported.
  - Inventory: 1.09M.
  - Wave-1 editors: 1.45M.
  - Reviews: 1.3M.
  - Fixers: 1.1M.
  - Harness: 0.27M.
  - Decision log: 0.40M.
  - Final cleanup: 0.07M.
- **Lead tokens:** not visible to me.
- **Wall time:** about 2 h (04:22 → 06:20).

## 7. What I would change in the skill for this model and harness

1. **Design the shared contracts before the parallel editors start.** The highest-leverage step was the lead
   writing the small contract modules before wave 1, together with the domain-model moves by script:
   `action-kit`, `db-errors`, `colors`, `time`, `projectMemberOf`, `workspaceRoleAllows`, `actionErrorText`,
   `crypto`. Even so, each editor produced a "needs from others" list, which needed a whole extra wave. The
   skill should say: before step 4, write the shared modules, assign ownership by contract, and give each
   editor its adoption sites outside its own files.
2. **Add a seeded route crawl (base build vs head build) to the addendum.** It checks SSR HTML and `__data.json`
   for every route, signed in and out. It is cheap (about 1 minute), and it is the only check that sees loads,
   guards and rendered markup at once. The logic harness cannot see those, and they are where the previous run's
   regressions were. Lessons from this run:
   - normalise for build hashes, hydration markers and relative times;
   - run a base-vs-base pass to measure noise;
   - start the server with `exec`, so killing it by PID kills node. A subshell PID left the base server running.
3. **Keep harness targets in step with renames.** Each export rename or signature change (`safeRedirect`
   switching to `URLSearchParams`, `readJsonBody` becoming `readWebhookBody`) broke the harness until the lead
   mapped it. Editors should report renames in a fixed section so the lead can update `targets.mjs` at once.
4. **Scope reviewers to a commit range, not the whole diff.** Round-1 reviewers read a 570-file diff; one used
   390k tokens. Later rounds scoped to the last fix commit were cheaper and still found leftovers.
5. **Refine the counter rules.**
   - Count a timer routed through a named helper as one named workaround, not as many.
   - Exclude property-key dispatch (`case 'epic'` in a filter language) from identity branches.
   - Report single-caller parameters introduced by the refactor separately.
6. **Haiku has no good role here.** Scripts produce the skeleton and the graph in seconds. Inventory and review
   need Sonnet-level judgment, so the "Haiku for summaries" advice did not apply on this codebase.
7. **The 12 KB inventory cap held only roughly.** All 7 files landed between 11.5 and 14.6 KB. The 25-finding cap
   was what kept them usable.
