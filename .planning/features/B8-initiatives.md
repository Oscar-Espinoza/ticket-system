# B8 — Initiatives

## Goal
Workspace-level goals that group epics across the workspace's projects, with
rolled-up progress.

## UX
- `/dashboard/workspaces/[slug]/initiatives`: header + "New initiative"; rows with
  name, status (Planned / Active / Completed), owner avatar, target date, epic count,
  aggregated progress. Status filter tabs. Empty state.
- Create dialog: name, description, status, owner (workspace members), target date.
- Detail `/initiatives/[initiativeId]`: editable name + description, property
  sidebar (status, owner, target date, progress), linked epics table (epic, project
  key, status, health, target, progress) with remove, "Add epic" picker (epics of the
  workspace's projects where the viewer is a member), and a read-only mini
  timeline of the linked epics. Delete initiative (owner / workspace admin).
- Epic sidebar "Initiative" picker lists the workspace's initiatives when the
  project belongs to a workspace and the viewer is a workspace member.

## Data / actions
- Reads `src/lib/initiatives.ts`: `getWorkspaceInitiatives(workspaceId, userId)`,
  `getInitiativeDetail(workspaceId, initiativeId, userId)`,
  `getInitiativeOptions(workspaceId)`; epics are only ever read from projects the
  viewer is a member of (EXISTS on project_member) — progress aggregates too.
- Actions `src/app/actions/initiatives.ts`: `createInitiative`, `updateInitiative`,
  `deleteInitiative`, `setEpicInitiative({projectId, epicId, initiativeId|null})`.
  Workspace ones use `requireWorkspaceMember` (delete: admin or initiative owner);
  linking also needs `authorizeProjectAction(projectId,'write')`, the epic in that
  project, and the project in the initiative's workspace.

## Edge cases
- Non-member / unknown slug or id → `notFound()`.
- Owner must be a workspace member; target date valid YYYY-MM-DD.
- Deleting an initiative unlinks its epics (FK set null).
- Project removed from the workspace later: link stays, but can no longer be
  created; the epic still shows in the initiative for its project's members.
