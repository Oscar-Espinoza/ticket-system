# Inventory: OTHER UI (components outside the big feature folders, plus src/lib/svelte/*)

Scope note: besides the listed folders this also covers command-palette, project, pwa, roadmap, similar, sla, sync (all not in the exclusion list). Paths are relative to `src/lib/components/` unless they start with `src/`.

## Structural findings (max 25, most important first)

**Clipboard / copy-link written 4+ times**
- [hidden] integrations/copy-field.svelte:30 vs developer/copy-field.svelte:9 — two `CopyField` components with the same name and job (read-only value + copy button), different props (`multiline`/`id`/`class` vs not), different toasts and fallbacks. 8 importers use the integrations one, only developer/sentry-section.svelte:8 uses the other. Fix idea: delete developer/copy-field, point sentry-section at the integrations one.
- [hidden] invite-panel-utils.ts:6 and workspaces/workspace-invites.ts:6 — byte-identical `copyText` + `announceSent` (even the toast copy). A change to the "email isn't configured" message must be made twice. Fix idea: one `invite-toasts.ts`; both folders import it.
- [hidden] epics/epic-list-row.svelte:63, epics/epic-detail.svelte:190, customers/customer-list-item.svelte:46, customers/customer-detail.svelte:91, documents/documents-list.svelte:15, security/backup-codes.svelte:20, oauth/oauth-app-settings.svelte:63, productivity/issue-actions.ts:12 — each re-does `navigator.clipboard.writeText` + try/catch + toast with a third wording ("Could not copy to the clipboard." / "Copy failed — ..."). Fix idea: one `copyToClipboard(text, label)` in `@/lib/clipboard`; CopyField and the invite helpers call it.

**Two chart toolkits**
- [hidden] charts/chart-frame.svelte.ts:22,45,90 (`niceScale`, `ActiveIndex`, `useActiveIndex`) vs insights/chart-kit.svelte.ts:10,22,57 (`niceMax`, `IndexHover`, `useIndexHover`) — same nice-axis and hover-index logic twice. Also charts/chart-tooltip.svelte vs insights/chart-tooltip.svelte, charts/chart-table.svelte vs insights/sr-table.svelte, charts/swatch.svelte (kind 'line') vs insights/series-key.svelte. cycles/* uses charts/, dashboards+insights use insights/. Fix idea: keep charts/, move insights' bar/column/trend onto it, delete chart-kit/series-key/sr-table/tooltip.
- [surplus] charts/chart-legend.svelte, charts/y-axis.svelte, charts/chart-table.svelte, charts/swatch.svelte, charts/chart-frame.svelte.ts — no importer outside charts/ except bar-chart/line-chart; confirm they are used inside those two, otherwise dead. Fix idea: grep inside charts/ and drop leftovers when the toolkits merge.

**Epics and initiatives are forks of each other**
- [hidden] initiatives/initiative-name.svelte vs epics/epic-name.svelte, initiatives/initiative-description.svelte vs epics/epic-description.svelte, initiatives/initiative-status-picker|options|icon.svelte vs epics/epic-status-*.svelte — near-identical after s/epic/initiative/ (status-picker diff is formatting only). Initiative components already reach into epics/ for rich-text, date-picker, member-picker, optimistic, property-button (initiatives/initiative-detail.svelte:23-31). Fix idea: a generic `entity/` set (name, description, status picker taking `statuses`+`labels`+icon snippet) used by both.
- [hidden] initiatives/initiative-description.svelte:6 and initiatives/create-initiative-dialog.svelte:26 import `EPIC_DESCRIPTION_MAX` for initiatives; `INITIATIVE_NAME_MAX` is its own copy of `EPIC_NAME_MAX` (80). Changing the epic limit silently changes initiatives. Check server/actions/initiatives for what it really enforces. Fix idea: own `INITIATIVE_DESCRIPTION_MAX` (or a shared `ENTITY_*`) in initiative-model.ts, imported by the server too.
- [needless] epics/ is a 46-file bucket holding generic pieces (date-picker, color-swatches, member-picker, chip-button, rich-text*, optimistic.svelte.ts, progress-ring) that customers/, initiatives/, roadmap/, cycles/ import (grep `components/epics/` outside epics). Fix idea: move the generic ones to a neutral folder (e.g. `pickers/`, `rich-text/`).

**UI copies of server permission rules**
- [hidden] workspaces/workspace-member-row.svelte:42-46 and workspaces/workspace-invitation-row.svelte:44 and workspaces/workspace-invite-dialog.svelte:101 — "owner changes roles; admin manages members only" re-derived inline from `viewerRole`. Server has it as `inviteRolesFor` (src/lib/server/actions/workspaces.ts:392) and an inline check near :594. Project roles do it right (workspaces/role-rules.ts shared with server). Fix idea: `workspace-role-rules.ts` (client-safe) imported by workspaces.ts and the three components.
- [hidden] epics/epic-updates.svelte:66 `canWrite && (isAdmin || update.author?.id === viewer.id)` mirrors server/actions/epics.ts:479-481 (`update.authorId !== userId && !isAdmin`). `isAdmin` is threaded as a prop epic-detail → epic-updates (and customers `isAdmin` into customer-list-item.svelte:30). Fix idea: `canDeleteUpdate(role, authorId, userId)` in epic-model.ts used on both sides.
- [hidden] settings/password-form.svelte:10 — `MIN_LENGTH = 8 // Keep in sync with emailAndPassword.minPasswordLength` (src/lib/auth.ts:89). Comment is the only link. Fix idea: export `MIN_PASSWORD_LENGTH` from a shared module; auth.ts and the form (and sign-up/reset pages) import it.

**Save / pending / toast / error repeated per form**
- [hidden] ~50 `let pending|isPending|saving = $state(false)` declarations plus ~92 `finally {` blocks and ~187 `result.ok`/`result.error` sites across epics (14), workspaces (11), dashboards (7), settings, initiatives, developer, integrations, documents. Each re-writes `pending = true; try { const r = await action(); if (!r.ok) toast.error(r.error); else toast.success(...) } finally { pending = false }`. e.g. workspaces/workspace-member-row.svelte:42-60, developer/vcs-section.svelte:46-70 (`run` helper local to one file), settings/labels/label-editor.svelte:30-46 vs settings/workflow/state-editor.svelte:36-52 (same shape, different action). Fix idea: `runAction(pendingRef, () => action(), {success, onError})` helper next to settings/action-state.svelte.ts.
- [surplus] settings/action-state.svelte.ts `createActionState`/`useResultToast` is adopted by only 6 files (profile, project-details/key/parent/visibility, danger-zone); the other settings forms (password-form, label-editor, state-editor, project-save-as-template, all import/, slack/, integrations/) use ad hoc state. Two competing patterns in one folder. Fix idea: pick one; make the runAction helper above the standard.
- [needless] settings/labels/label-utils.ts and settings/workflow/workflow-utils.ts are 1-line identical files (`issuesLabel`); 17 other inline `n === 1 ? '' : 's'` plurals (dashboards/dashboard-list.svelte:108, integrations/webhook-settings.svelte:183, pwa/push-settings.svelte:219, project-templates/templates-manager.svelte:13 local `plural`). Fix idea: one `pluralize(n, 'issue')` in `@/lib/format`.

**Provider branches**
- [special:module-identity-branch] developer/vcs-connect-form.svelte:11,37,54,67,98 and developer/vcs-section.svelte:21,84 — two `VCS_COPY` tables keyed by gitlab/bitbucket (name / pr noun / description in one file, repoLabel / placeholder in the other), plus `provider === 'gitlab'` for base-URL field and token hint and `'bitbucket'` for username field. Adding a host means editing both files and vcs-mark.svelte:11. Fix idea: one descriptor map (name, mark, pr noun, fields[], hint) in developer/ or `@/lib/vcs/providers.ts`, forms render `fields`.
- [special:module-identity-branch] developer/vcs-mark.svelte:11 plus developer/vcs-section.svelte:84-88 (inline gitlab/bitbucket mark with hard-coded brand colours `#e24329`/`#2684ff`) — vcs-section ignores `VcsMark` that exists for this. Fix idea: use `<VcsMark>` with color class from the descriptor.
- [hidden] github/use-github-viewer.svelte.ts:12-27 and developer/use-vcs-connections.svelte.ts:10-25 — same 5-minute TTL promise cache + `cancelled` effect + `{current}` getter, copied; github/use-webhook-health.svelte.ts has a third variant without cache. Fix idea: `createCachedLoader(ttl, fetch)` + `useLoaded(getKey, loader)`.
- [needless] project-wide Slack setup is split: integrations/slack-settings.svelte (project webhook) vs slack/* (account app, 4 files) — different concepts under one name, and account Slack lives in ACCOUNT_SETTINGS_NAV (app-shell/routes.ts:42) next to "API keys". Not a bug; just the place to look when changing Slack events.

**Duplicated helpers**
- [hidden] pwa/push-settings.svelte:67-100 (`deviceLabel`, nested ternaries) vs security/user-agent.ts:3-30 (`describeUserAgent`, `isMobileUserAgent`) — two UA classifiers with slightly different rules (Opera /OPR vs /OPR\/|Opera, 'Browser' fallback vs 'Unknown'). Fix idea: push-settings imports security/user-agent.
- [hidden] relative-time/date formats: 8+ separate `new Intl.DateTimeFormat` instances (customers/requests-timeline.svelte:30, epics/update-card.svelte:18, security/sessions-list.svelte:17, integrations/api-key-settings.svelte:34, sla/time-in-status.svelte:16, ...) with locale 'en' in some and `undefined` in others. Fix idea: a `@/lib/format-date` with two or three named formats.

**Dead / import-structure**
- [surplus] coming-soon.svelte (19 lines) — zero importers (grep `coming-soon|ComingSoon` over src/ finds only its own header). Fix idea: delete.
- [surplus] developer/provider-marks.ts — zero importers; barrel "under the names of the React exports". Fix idea: delete.
- [surplus] epics/date-label.svelte (11 lines) — zero importers (grep `date-label|DateLabel` empty). Fix idea: delete.
- [surplus] ui/scroll-area/{index.ts,scroll-area.svelte,scroll-bar.svelte} — nothing imports `ui/scroll-area` or `ScrollArea` anywhere under src/. No `import.meta.glob` in src. Fix idea: delete the shadcn port.
- [needless] 17 component-level import cycles (all type-only, so invisible in dep-base `sccs`): child imports `Props` types from the parent's `<script module>`: settings/* ×6 ← settings/project-general-form.svelte:3 (7-file cycle; project-general-form also imports a type from project-templates/template-dialog.svelte), github/* ×3 ← github-settings.svelte, slack/* ×3 ← slack-app-settings.svelte, developer/{vcs,sentry}-section ← developer-settings.svelte, security/workspace-sso-form ↔ settings, workspaces/workspace-project-row ↔ projects, epics/add-dependency ↔ epic-relations, invite-panel/member-list pairs, app-shell/sidebar-project-item ↔ sidebar-projects, project-templates/template-form ↔ template-dialog. Value-wise acyclic (the only value SCC is issue-filtering ↔ issue-model). Fix idea: put shared prop types in a sibling `*-types.ts` (workspaces/workspace-types.ts is the model to copy).
- [needless] svelte/theme.svelte.ts:3-13,31 and many headers across 147 files in this area carry "Port of src/components/*.tsx" / next-themes provenance; THEME_WATCHER_OPTIONS reproduces next-themes defaults instead of the app's own. Fix idea: drop provenance comments in one sweep.

## Special-case tally for this area

| Category | Count | Examples |
|---|---|---|
| module-identity branch | 8 | developer/vcs-connect-form.svelte:37, :54, :67, :98; developer/vcs-section.svelte:84; developer/vcs-mark.svelte:11; issue-detail/slots/header-github.svelte:61 (other area); src/lib/vcs/providers.ts prNoun |
| single-caller param | 3 | integrations/copy-field.svelte `multiline`/`id` (only 2-3 callers use them); epics/epic-updates.svelte `isAdmin`; epics/epic-name.svelte `canWrite` (initiative twin has none) |
| silent catch | 9 | github/use-webhook-health.svelte.ts:21 `.catch(() => {})`; pwa/push-settings.svelte:51 (commented retry); app-shell/shell-frame.svelte:37; app-shell/sidebar-project-item.svelte:27; project/slots/live-updates.svelte:125 |
| timer-workaround | 2 | developer/copy-field.svelte:16 `setTimeout` reset; sla/use-now.svelte.ts ticking clock (intentional) |
| copied constant | 6 | settings/password-form.svelte:10 (8); initiatives/initiative-model.ts:23 (80 = EPIC_NAME_MAX); epics/epic-description.svelte:7 / initiatives (EPIC_DESCRIPTION_MAX reused); developer/{vcs-section,vcs-connect-form} `VCS_COPY` ×2; github + developer TTL_MS 5min ×2; roadmap/timeline.svelte:63 + dashboards/widget-data.ts:13 `DAY_MS` |

## Nit counts

Provenance comments ("Port of src/components/…tsx", React hook names) per folder, files containing them: ui 30, app-shell 18, security 14, root 14, epics 10, documents 10, workspaces 8, customers 6, oauth 5, sla 4, project 4, integrations 4, initiatives 4, slack 3, recurring 3, pwa 3 (147 files total in scope).
Tiny style nits: settings/ forms mix `pending` / `isPending` / `saving` naming (workspaces uses `isPending`, developer `pending`): ~50 declarations across ~45 files.

## Cross-area observations

- `relativeTime` exists twice outside this area: issues/issue-properties.ts:24 and comments/relative-time.ts:16 (same signature).
- issue-detail/slots/header-github.svelte:61 `host.provider === 'github'` and issue-detail/slots/section-pull-requests.svelte consume `@/lib/vcs/providers` plus developer/vcs-mark; any provider descriptor refactor touches them and src/lib/vcs/providers.ts (`prNoun`/`prNumberLabel` hard-code gitlab).
- src/lib/server/actions/{invite,members}.ts import from `@/lib/components/workspaces/role-rules` — server code depends on a components folder; the shared rules belong under `src/lib/` (also where a workspace rule module would live).
- src/lib/server/actions/epics.ts imports `EPIC_*_MAX` from components/epics/epic-model, same inversion; initiatives/customers/templates/cycles/recurring/editor actions do too (grep `lib/components` in server/actions).
- cycles/velocity-chart.svelte and cycles/burndown-chart.svelte are the only users of charts/; dashboards/widget-body.svelte uses insights/ charts. Merging the two chart kits touches cycles, dashboards, insights.
