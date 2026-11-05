# Wave 2 lane notes

Each lane: your source files are `lanes.json` → `<lane id>.files`. These notes are binding, after PLAN.md.

## All lanes

Before anything else read docs/migration/WAVE1_APIS.md: the Svelte APIs of the ported UI primitives (src/lib/components/ui/*), ui-icons, theme, contexts and shared stores (selection, display options, filters, project data, view contexts, issue mutations, outbox, hotkeys, undo, auth client). Use them; never re-implement them locally.
Route files you create live under src/routes/ mirroring the src/app/ path (route groups like (auth) keep their names). For every page.tsx: +page.server.ts (load: the same server calls, same auth/permission checks, same redirects/404s) + +page.svelte; keep <svelte:head> titles.

## L1 — App shell, navigation, dashboard home, PWA

Shell lane. Also own: src/routes/+page.svelte(+server load) for src/app/page.tsx, src/routes/offline/, src/routes/dashboard/+layout.server.ts/+layout.svelte/+page*/+error.svelte, src/routes/dashboard/projects/[id]/+layout*, src/routes/dashboard/settings/+layout*, src/routes/dashboard/projects/[id]/settings/+layout*, and src/routes/dashboard/projects/+error.svelte (not-found).
- The async server components (app-shell.tsx, project-list.tsx, slots/sidebar-workspaces.tsx, slots/sidebar-favorites.tsx) fetch data on the server: move that fetching into src/routes/dashboard/+layout.server.ts (and the project layout load where it belongs) and pass it down as props/context. Put reusable server data functions (e.g. getProjectsForUser from project-list.tsx — a test imports it) in a server module such as src/lib/components/project-list.server.ts with the same export name.
- loading.tsx files → one navigation progress indicator in the dashboard layout using `navigating` from $app/state (show after ~150 ms), matching the existing visual style.
- error.tsx / not-found.tsx → +error.svelte with the same UI.
- Add OfflineBanner and RegisterServiceWorker (pwa/) to src/routes/+layout.svelte at the spot W1c marked (you may edit only that spot). public/sw.js stays as the service worker file.
- Command palette, hotkey overlay, topbar chrome, user menu, sync status, navigation tabs and sidebar: keep every keyboard shortcut (use the hotkeys store from W1c).

## L2 — Auth, invites, OAuth consent, security, people

Auth lane. Own src/routes/(auth)/**, src/routes/invite/**, src/routes/oauth/**, src/routes/request/**, the dashboard routes listed in your sources (people, settings/security, settings/oauth-apps, settings/api-keys, workspaces/[slug]/security).
- Sign-in/sign-up/2FA/SSO forms use authClient from src/lib/svelte/auth-client.ts (better-auth/svelte); keep every error code mapping (SSO_REQUIRED, USER_ALREADY_EXISTS*, PASSWORD_TOO_SHORT, ACCOUNT_TEMPORARILY_LOCKED, …) and the safe-redirect logic (src/app/(auth)/safe-redirect.ts is React-free — import it as is).
- Pages that redirected signed-in/signed-out users server-side must do so in +page.server.ts load (redirect(303, …)).
- OAuth consent: same authClient.$fetch calls and the same scopes/client display.
- Security settings (2FA setup/QR, sessions, SSO/SCIM config with the DNS TXT proof): keep every state and confirmation dialog.

## L3a — Issues list/board core, SLA, similar, archive/trash

Issues core lane. Own src/routes/dashboard/projects/[id]/+page*, archive/, trash/.
- Board: @dnd-kit/react 0.4 → @dnd-kit/svelte 0.5.3 (reference "Drag and drop"); move() from 'dnd-helpers-svelte'. Keep the exact reorder/move semantics (which mutation is called with which position/state), keyboard dragging, overlay and drop animation behaviour.
- Use the W1c issue-mutations store (optimistic updates) exactly where React used useIssueMutations.
- Keep list virtualization/grouping/sorting behaviour, context menu items, selection (shift/cmd click), and keyboard navigation.

## L3b — Views, my issues, search

Views lane. Own src/routes/dashboard/projects/[id]/views/**, src/routes/dashboard/views/**, src/routes/dashboard/my-issues/** (including the server-only queries.ts → move to src/routes/dashboard/my-issues/queries.server.ts or import the existing src/app/dashboard/my-issues/queries.ts as is if it is React-free), src/routes/dashboard/search/**.
- Calendar, table and timeline views, filter/display menus and the search syntax help must keep every interaction (drag to reschedule on timeline/calendar if present, column sorting, sticky headers).
- use-sortable-groups.ts → views/use-sortable-groups.svelte.ts.

## L4 — Issue detail, hierarchy, pickers

Issue detail lane. Own src/routes/dashboard/projects/[id]/issues/**.
- The issue page is the most used screen: keep every slot (properties sidebar, description editor slot, activity, relations, sub-issues, attachments, links, PRs, SLA, customers, time in status…), every keyboard shortcut and every optimistic update.
- The description editor and comments are lane L5's components (src/lib/components/editor/*, collab/*, comments/*): import them by their convention paths and props as defined by the React contracts; don't re-implement them.
- Pickers (issue-pickers/*) are used everywhere: keep their exported names and props exactly; index.ts barrel → src/lib/components/issue-pickers/index.ts.

## L5 — Editor, collab, comments, documents

Editor/collab lane. Own src/routes/dashboard/projects/[id]/docs/**.
- Tiptap 3.31.3 via svelte-tiptap 3.0.2 (reference "Tiptap"): React node views → SvelteNodeViewRenderer + NodeViewWrapper; suggestion popups (mentions, slash menu) → mount()/unmount() of Svelte components in the suggestion render callbacks; collaboration via @tiptap/extension-collaboration + @tiptap/y-tiptap + yjs exactly as now. The extension list lives in src/components/editor/extensions.ts — if it imports React (node views), create src/lib/components/editor/extensions.ts with the Svelte renderers and the same extension configuration.
- use-collab-editor.ts / use-collab.ts carry correctness-critical logic fixed in the last review rounds (provenance: description_source/description_rev, collab-meta.adoptedRev written in the same Yjs transaction as the adopted content, whenPersisted before onAdopted, external edits applied even with peers present). Port that logic line by line into src/lib/components/collab/*.svelte.ts. Export the pure `reconcileTarget` from a plain module src/lib/components/collab/reconcile.ts (a test imports it) with identical behaviour.
- Markdown rendering (markdown.tsx) → svelte-exmarkdown with gfm, same element overrides.

## L6 — Epics, roadmap, initiatives

Planning lane. Own src/routes/dashboard/projects/[id]/epics/**, roadmap/**, src/routes/dashboard/workspaces/[slug]/initiatives/**.
- Roadmap/timeline interactions (drag to change dates, zoom levels, today marker) must behave the same.
- foreign-epics-store.ts → epics/foreign-epics-store.svelte.ts.

## L7 — Cycles, triage, inbox, recurring, productivity

Workflow lane. Own src/routes/dashboard/projects/[id]/cycles/**, triage/**, settings/recurring/**, src/routes/dashboard/inbox/**, drafts/**, templates/**.
- productivity/: templates-store.ts, use-draft-autosave.ts → .svelte.ts; new-issue-bus.ts and issue-defaults.ts are React-free (import as is).
- Inbox keyboard triage (snooze/when options, mark read), triage accept/decline flows, cycle burndown charts (charts/* belong to L9b: import by convention path), recurring schedule editor: keep every behaviour.

## L8 — Project settings, templates, import, developer, GitHub

Project settings lane. Own src/routes/dashboard/projects/[id]/settings/** EXCEPT +layout* (L1) and recurring/ (L7).
- Settings forms using useActionState → the generated (prev, formData) wrappers with the same field names; keep validation messages and pending states.
- GitHub/GitLab/Bitbucket connection UIs, import (Asana/Shortcut) flows with progress, API keys/OAuth app developer settings, workflow states editor (drag reorder), labels, templates, SLA, intake, automations, planning, audit (audit components belong to L9a — import by path), members.

## L9a — Workspaces, customers, integrations, Slack, audit, user settings

Workspace lane. Own src/routes/dashboard/workspaces/** EXCEPT [slug]/security (L2) and [slug]/initiatives (L6); src/routes/dashboard/projects/[id]/customers/**, members/**; src/routes/dashboard/settings/** EXCEPT +layout* (L1), security/, oauth-apps/, api-keys/ (L2).
- src/app/dashboard/settings/notifications/actions.ts and slack/actions.ts are server actions: use the generated wrappers @/lib/actions/settings-notifications and @/lib/actions/settings-slack.
- Customers (requests, linked issues with the private-project rules fixed in the last review), integrations (Sentry/Figma/VCS), Slack link/install flows (they navigate to /api/slack/* — plain links, not goto), audit log view with filters and export.

## L9b — Dashboards, insights, charts

Dashboards lane. Own src/routes/dashboard/dashboards/**, src/routes/dashboard/projects/[id]/insights/**.
- Charts are hand-rolled (check src/components/charts/*): port the SVG/CSS exactly; keep tooltips, legends, responsive sizing (ResizeObserver) and empty states.
- Dashboard widgets (widget-model.ts / widget-data.ts are React-free — import as is), add/edit/remove widget dialogs, layout editing.

## L10 — API routes and .well-known

API lane. Port every src/app/api/**/route.ts to src/routes/api/**/+server.ts (same path, same methods, same status codes, headers and bodies), and src/app/.well-known/oauth-authorization-server/api/auth/route.ts to src/routes/[x+2e]well-known/oauth-authorization-server/api/auth/+server.ts (reference verification item 17).
- api/auth/[...all] is handled by src/hooks.server.ts (svelteKitHandler) — do NOT create a +server.ts for it; note it in your report.
- Handlers: `export const GET: RequestHandler = async ({ request, params, url, locals }) => …`. Next's (request, { params }) with awaited params → event.params. NextRequest/NextResponse → Request/Response (Response.json, new Response). Drop `export const runtime/dynamic/revalidate`; `maxDuration` → `export const config = { maxDuration }` only if adapter-vercel needs it (comment it).
- Keep raw-body handling for webhook signature checks (await request.text() before parsing), the SSE stream (request.signal abort, keep-alive pings, headers per reference "Streaming and SSE"), graphql-yoga (reference "graphql-yoga"), uploads/attachments (multipart; note the adapter-node BODY_SIZE_LIMIT default 512K in your report with the size the routes accept), the cron route (CRON_SECRET), Slack routes (they rely on the CSRF exemption in hooks.server.ts).
- src/app/api/v1/_lib/api.ts → src/routes/api/v1/_lib/api.ts (or src/lib/server/… if it must be shared); keep its auth/rate-limit/error semantics.
- These are server-only: no Svelte components. Use src/lib as is.
