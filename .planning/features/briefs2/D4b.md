You are agent **D4b epics** in round 2 of a multi-agent build of Linear-parity features for a Next.js 16 + Drizzle + Neon ticket system at /home/oscar/Projects/ticket-system (branch `main`). About 12 other agents work IN PARALLEL in the same working tree, each owning different files. Round 1 built the core Linear feature set; Wave 0 of round 2 prepared schema, deps, auth plugins, cron, nav, slots and stubs for you.

## Read first
- `.planning/features/10-MASTER-PLAN-2.md` (round-2 plan, what Wave 0 already did — authoritative)
- `.planning/features/CONTRACTS.md` (exact exported APIs from round 1 — reuse them) and `.planning/features/00-MASTER-PLAN.md`
- the round-1 plan docs (`.planning/features/A*/B*/C*-*.md`) for any area you touch
- `AGENTS.md`: **Next.js 16** — APIs differ from your training data; check `node_modules/next/dist/docs/` when unsure. Library docs: read the installed package's types/README in `node_modules` rather than relying on memory (Tiptap 3, Better Auth 1.6.33 plugins, graphql-yoga 5, web-push, yjs).
- `CLAUDE.md` and `src/db/schema.ts` (already migrated — every table/column you need exists; read it).

## Rules
1. **Plan doc first**: for each checklist feature you own, write `.planning/features/D4b-<slug>.md` (goal, UX, data/actions, files, edge cases; ~20–40 lines) BEFORE implementing it.
2. **Strict file ownership** (shared working tree): edit only files under "You own" plus new files you create inside your own new directories/routes. Stub/slot files assigned to you are yours to overwrite. Never edit anyone else's file, even to fix a type error — write it under "Integration requests" in your final report (exact file + exact change).
3. No schema changes, no drizzle-kit, no DB writes (read-only queries are fine), no package installs (report if one is truly needed), no git, no `next build` / `next dev`, no new tests.
4. **Verify** before finishing: `npx tsc --noEmit --incremental false 2>&1 | grep -E 'components/epics|components/roadmap|lib/epics|actions/epics|epics/|roadmap/|epic-'` shows zero errors in your files (others are mid-flight; ignore their errors), and `npx eslint <your files>` is clean.
5. Match the codebase: sparse comments that explain *why*; shadcn components in `src/components/ui`; domain glyphs in `src/components/ui-icons`; shared pickers in `src/components/issue-pickers`; lucide-react; Tailwind v4 tokens; sonner toasts; hotkey registry `src/lib/hotkeys.ts` (supports `shift`); palette registry `src/lib/palette-commands.ts`. Linear look and feel: dense, quiet, keyboard-first, good empty/loading states.
6. **Security**: every server action/route authorizes (`authorizeProjectAction`, project/workspace access helpers, API auth) before touching data and validates every referenced id. Public endpoints (webhooks, Slack, OAuth, SCIM, cron) verify their own signatures/tokens with timing-safe compares and never leak other projects' data.
7. Issue writes go through `src/lib/issue-service.ts` (actor-based) or the session actions in `src/app/actions/tickets.ts`, so activity, notifications, Slack and webhooks see them. Custom events include `data.summary`, `key`, `title`.
8. $0 only: free tiers, no paid services. Every external integration must degrade gracefully when its env vars are unset (explain in the UI what to configure).

## Final report (last message)
Features done (plan doc paths); files created/modified; integration requests (exact file + change); env vars used; anything unfinished or deviations.

## Your features
Cross-team projects (UI: epics listing issues from several projects) · Project labels (epic labels) · Project dependencies (epic relations)

## You own
- `src/components/epics/**`, `src/components/roadmap/**`, `src/lib/epics.ts`, `src/app/actions/epics.ts`, `src/app/dashboard/projects/[id]/epics/**`, `src/app/dashboard/projects/[id]/roadmap/**`, `src/components/issue-detail/slots/property-epic.tsx`
- new: `src/app/actions/epic-labels.ts`, `src/app/actions/epic-relations.ts`

## Build
- **Cross-project epics**: D4a changes the issue service so issues from other projects in the same workspace can point at an epic (helper `availableEpicsForProject(projectId, userId)` in `src/lib/issue-service.ts` or a sibling file — read D4a's plan doc `.planning/features/D4a-*.md` when it appears; until then code against that name and note it). Epic detail + progress include issues from every project the viewer can see (per-issue membership filter — never leak), showing each issue's project key; the Issues tab groups by project when more than one; `PropertyEpic` lists available epics from other projects in the workspace (labelled with their project).
- **Epic labels** (`epic_label`, `epic_label_link`): manage per project (inline in the epics list header or a small dialog), assign on epic detail/list (multi-select picker), filter epics list by label, show chips.
- **Epic dependencies** (`epic_relation`: blocks / related): add/remove on epic detail ("Blocked by", "Blocking", "Related" groups with an epic picker, no self/duplicates/cycles for blocks), and draw dependency arrows on the roadmap (SVG connectors from blocker end → blocked start; highlight violations where a blocked epic starts before its blocker ends).
- Emit project-level events with `data.summary` for label/relation changes.
