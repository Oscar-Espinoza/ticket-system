# B10 — Issue templates

## Goal
Reusable starting points for new issues (title, description, default properties).

## UX
- `/dashboard/projects/<id>/settings/templates`: list (name, title preview, property
  chips) + "New template" → Dialog form: name, title, description, status,
  priority, assignee, labels, estimate (the shared pickers). Edit / delete (confirm).
  Members (write) edit; guests see read-only.
- New-issue dialog header: "Template" dropdown → applying fills empty title /
  description and sets the template's properties.
- Command palette inside a project: "New issue from template: <name>".
- Issue `…` menu: "Save as template" (from the issue's text + properties).
- Row menu "Create issue" → `/dashboard/projects/<id>?template=<id>` (IssueShortcuts opens it).

## Data / actions (`src/app/actions/templates.ts`)
- `listTemplates(projectId)` (read), `createTemplate`, `updateTemplate`,
  `deleteTemplate` (write). Name 1–60 chars; title ≤200; description ≤10k.
- `data` = `{stateId, priority, assigneeId, labelIds, estimate}` sanitized with
  `sanitizeIssueDefaults` (every id must belong to the project).
- Client cache `src/components/productivity/templates-store.ts` (per project,
  invalidated after CRUD in this tab).

## Files
`src/app/actions/templates.ts`, `src/app/dashboard/projects/[id]/settings/templates/page.tsx`,
`src/components/productivity/template-settings.tsx`, `templates-store.ts`,
`template-menu.tsx`, `property-chips.tsx` (chips shared with the new-issue
dialog), new-issue dialog, `menu-extra-items.tsx`, `IssueShortcuts`.

## Edge cases
- A template pointing at a deleted label/state: stale ids are dropped when applied
  (only ids present in project data are used).
- Estimate ignored when the project's scale is "none".
