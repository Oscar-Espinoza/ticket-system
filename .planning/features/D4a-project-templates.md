# D4a — Project templates

## Goal
Save a project's setup as a reusable template and create new projects from it.

## Snapshot (`project_template.config`, version 1)
```ts
{ version: 1,
  states: { name, type, color, position, description }[],
  labels: { name, color, description }[],
  settings: { estimateScale, cyclesEnabled, cycleDurationWeeks, cycleAutoCreate,
              cycleStartWeekday, cycleAutoRollover, cycleCooldownWeeks,
              triageEnabled, autoArchiveMonths, autoCloseMonths, slaPolicy },
  issueTemplates: { name, title, description, data }[] }   // data ids → names
```
Issue template `data.labelIds` / `stateId` are stored as `labelNames` /
`stateName` and re-mapped to the new project's ids; `assigneeId` is dropped.

## UX
- `/dashboard/templates`: list of templates the viewer can use (own + shared to
  a workspace they belong to): name, description, contents summary (N states,
  N labels, N issue templates), "Shared with <workspace>" chip. Owner can edit
  name / description / sharing and delete. "New template" dialog: pick a project
  you administer, name, description, share-with workspace (optional).
- Settings → General → "Save as template" button (admins) opening the same dialog
  prefilled with the project.
- Create-project dialog (dashboard + workspace): **Template** select ("Default
  workflow" + usable templates, loaded on open).

## Actions (`src/app/actions/project-templates.ts`)
`listProjectTemplates()`, `createProjectTemplate({projectId, name, description,
workspaceId|null})` (project admin; workspace membership if shared),
`updateProjectTemplate({id, name, description, workspaceId|null})` (owner),
`deleteProjectTemplate({id})` (owner). Helpers in `src/lib/project-templates.ts`:
`snapshotProject`, `normalizeTemplateConfig`, `projectSeed(projectId, now,
config|null, userId)` → `{settings, statements}`, `usableTemplateFilter`,
`getUsableTemplateConfig`, `templateSummary`. Client: `TemplateSelect` /
`useProjectTemplates` / `TemplateDialog` in `src/components/project-templates/`.
`createProject` / `createWorkspaceProject` accept `templateId`: access re-checked
(owner or workspace member of `template.workspaceId`), then ONE `db.batch`:
project (settings from template) + owner member + states + labels + issue
templates. Invalid / empty snapshot → default states.

## Edge cases
Template with no valid states → default workflow. Unknown estimate scale → none.
Shared template whose workspace the user left → not usable. Config sanitized on
read (types, lengths, max 50 states / 200 labels / 100 issue templates).
