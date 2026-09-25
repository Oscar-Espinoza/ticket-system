# D4a — Sub-teams (project hierarchy)

## Goal
A project ("team") can have a parent project in the same workspace
(`project.parentId`). Purely organisational: issue lists are NOT merged.

## UX
- Settings → General → **Parent team** select (owner/admin): "None" + projects
  in the same workspace where the viewer is a member, excluding itself and its
  descendants. Disabled with a hint when the project isn't in a workspace.
- Sidebar "Your projects": sub-teams render nested (indented) under their parent
  when the viewer sees both; otherwise top-level.
- Workspace page "Teams": rows ordered as a tree, children indented with a
  corner glyph.

## Data / actions
`updateProjectParent(prev, formData{projectId, parentId})` in
`src/app/actions/project-settings.ts`: admin of the child; parent must exist,
share the child's non-null workspace, viewer must be a member of it; cycle check
walks the candidate parent's ancestors (recursive CTE, depth cap) and rejects if
the child appears. `parentId=''` clears.
Leaving / joining a workspace (`addProjectToWorkspace`,
`removeProjectFromWorkspace`) clears the project's parent and detaches its
children, so links never cross workspaces.

## Files
`project-settings.ts`, `project-general-form.tsx`, `settings/general/page.tsx`,
`sidebar-projects.tsx`, `workspace-projects.tsx`, `workspaces.ts`.
Needs integration: `getProjectsForUser` / `AppShell` to pass `parentId`; the
workspace page to select `parentId` + `visibility` (see report).

## Edge cases
Parent deleted → FK sets null. Parent in another workspace (stale) → treated as
top-level by the UI and rejected by the action. Deep trees: sidebar indents one
level per depth, capped visually.
