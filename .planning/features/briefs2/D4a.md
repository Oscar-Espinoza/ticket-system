You are agent **D4a structure** in round 2 of a multi-agent build of Linear-parity features for a Next.js 16 + Drizzle + Neon ticket system at /home/oscar/Projects/ticket-system (branch `main`). About 12 other agents work IN PARALLEL in the same working tree, each owning different files. Round 1 built the core Linear feature set; Wave 0 of round 2 prepared schema, deps, auth plugins, cron, nav, slots and stubs for you.

## Read first
- `.planning/features/10-MASTER-PLAN-2.md` (round-2 plan, what Wave 0 already did — authoritative)
- `.planning/features/CONTRACTS.md` (exact exported APIs from round 1 — reuse them) and `.planning/features/00-MASTER-PLAN.md`
- the round-1 plan docs (`.planning/features/A*/B*/C*-*.md`) for any area you touch
- `AGENTS.md`: **Next.js 16** — APIs differ from your training data; check `node_modules/next/dist/docs/` when unsure. Library docs: read the installed package's types/README in `node_modules` rather than relying on memory (Tiptap 3, Better Auth 1.6.33 plugins, graphql-yoga 5, web-push, yjs).
- `CLAUDE.md` and `src/db/schema.ts` (already migrated — every table/column you need exists; read it).

## Rules
1. **Plan doc first**: for each checklist feature you own, write `.planning/features/D4a-<slug>.md` (goal, UX, data/actions, files, edge cases; ~20–40 lines) BEFORE implementing it.
2. **Strict file ownership** (shared working tree): edit only files under "You own" plus new files you create inside your own new directories/routes. Stub/slot files assigned to you are yours to overwrite. Never edit anyone else's file, even to fix a type error — write it under "Integration requests" in your final report (exact file + exact change).
3. No schema changes, no drizzle-kit, no DB writes (read-only queries are fine), no package installs (report if one is truly needed), no git, no `next build` / `next dev`, no new tests.
4. **Verify** before finishing: `npx tsc --noEmit --incremental false 2>&1 | grep -E 'issue-service|actions/(move|project-templates|projects|project-settings|workspaces)|menu-move|create-project-dialog|project-general-form|sidebar-projects|workspace-projects|dashboard/templates|lib/tickets|project-templates|lib/project-access'` shows zero errors in your files (others are mid-flight; ignore their errors), and `npx eslint <your files>` is clean.
5. Match the codebase: sparse comments that explain *why*; shadcn components in `src/components/ui`; domain glyphs in `src/components/ui-icons`; shared pickers in `src/components/issue-pickers`; lucide-react; Tailwind v4 tokens; sonner toasts; hotkey registry `src/lib/hotkeys.ts` (supports `shift`); palette registry `src/lib/palette-commands.ts`. Linear look and feel: dense, quiet, keyboard-first, good empty/loading states.
6. **Security**: every server action/route authorizes (`authorizeProjectAction`, project/workspace access helpers, API auth) before touching data and validates every referenced id. Public endpoints (webhooks, Slack, OAuth, SCIM, cron) verify their own signatures/tokens with timing-safe compares and never leak other projects' data.
7. Issue writes go through `src/lib/issue-service.ts` (actor-based) or the session actions in `src/app/actions/tickets.ts`, so activity, notifications, Slack and webhooks see them. Custom events include `data.summary`, `key`, `title`.
8. $0 only: free tiers, no paid services. Every external integration must degrade gracefully when its env vars are unset (explain in the UI what to configure).

## Final report (last message)
Features done (plan doc paths); files created/modified; integration requests (exact file + change); env vars used; anything unfinished or deviations.

## Your features
Issues moving between teams · Sub-teams / team hierarchy · Private teams · Project templates · Cross-team projects (service side: issues may belong to an epic owned by another project in the same workspace)

## You own
- `src/lib/issue-service.ts` (add move + cross-project epic validation; keep every existing export/signature), `src/lib/tickets.ts` (only `getIssueByKey` alias fallback), `src/lib/project-access.ts` (additive)
- `src/components/issue-detail/slots/menu-move.tsx`, new `src/app/actions/move.ts`, `src/app/actions/project-templates.ts`
- `src/app/actions/projects.ts`, `src/components/create-project-dialog.tsx`, `src/app/actions/project-settings.ts`, `src/components/settings/project-general-form.tsx`, `src/app/dashboard/projects/[id]/settings/general/**`
- `src/components/app-shell/sidebar-projects.tsx`, `src/components/workspaces/workspace-projects.tsx`, `src/app/actions/workspaces.ts` (additive: join/discover), `src/app/dashboard/templates/**` (stub), new `src/components/project-templates/**`

## Build
- **Move issue to another project** (`moveIssue(actor, fromProjectId, id, toProjectId)` in issue-service + session action requiring write in both projects): new number/key in the target (same counter logic as create), map state by name → same type → target default, keep labels by name (create missing? no — drop unmatched and record them in the event), clear cycle/milestone (and epic unless the epic is allowed cross-project), move sub-issues along (or detach — pick and document), keep comments/attachments/activity/relations/PR links, record `ticket_key_alias(oldKey → ticketId)`, emit `issue.moved` (data: from/to keys, summary) in both projects. Make `getIssueByKey` fall back to the alias so old permalinks redirect (B6's permalink page already canonicalizes keys — it calls getIssueByKey; if it needs a change note it). `MenuMove`: "Move to project…" picker listing projects where the viewer has write access; after moving, navigate to the new permalink.
- **Cross-project epics (service)**: allow `epicId`/`milestoneId` pointing at an epic owned by another project in the SAME workspace when the actor is a member of that project too; everything else still project-scoped. Export a helper other code can use to list epics available to a project (`availableEpicsForProject`) and document it (D4b builds the UI).
- **Sub-teams**: `project.parentId` (same workspace, no cycles) editable in Settings → General; sidebar shows sub-teams nested under the parent; parent issue lists are NOT merged (keep simple), but the workspace page shows the hierarchy.
- **Private teams**: `project.visibility` ('private' default | 'workspace') in Settings → General (owner/admin); workspace page lists workspace-visible projects the viewer isn't in with a "Join" button (joins as member); private ones stay hidden. Server re-checks everything.
- **Project templates**: save any project as a template (states, labels, estimate scale, cycles/triage settings, issue templates, SLA policy; optional workspace sharing), manage them at `/dashboard/templates`, and "Create from template" in the create-project dialog (atomic `db.batch`, seeded states from the template instead of defaults).
