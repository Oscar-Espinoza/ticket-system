# B9 — Workspaces (multiple teams)

## Goal
Optional grouping of projects ("teams") under a workspace with its own members,
so initiatives (B8) and cross-team views have a home.

## UX
- Sidebar `SidebarWorkspaces`: "Workspaces" section with a `+` (New workspace
  dialog: name → auto slug, editable). Each workspace → link to its page with
  an indented "Initiatives" link. No workspaces → a single muted
  "Create a workspace" row (the only entry point, so it isn't hidden).
- `/dashboard/workspaces/[slug]` (members only, else 404): header (name, slug,
  your role) + actions menu (rename, leave, delete — confirm by typing name).
  **Teams** section: projects in the workspace (links when you're a member,
  plain name + "Not a member" otherwise), "Add project" (your owner/admin
  projects not already here), "New project" (name + key, created in workspace),
  remove-from-workspace per row (workspace admin or project admin).
  **Members** section: avatar/name (→ profile), role select (owner-only for
  admin/member), remove; "Invite member" (email + role).
- Invite: an existing user who shares ≥ 1 project with you is added directly;
  anyone else gets an emailed signed link `/invite/workspace/[token]` (the
  response is the same "Invitation sent" either way — no user enumeration).

## Data / actions — `src/app/actions/workspaces.ts`
`createWorkspace`, `renameWorkspace`, `deleteWorkspace` (owner, typed name),
`leaveWorkspace` (non-owner), `addProjectToWorkspace` (workspace admin +
project admin → sets `project.workspaceId`), `removeProjectFromWorkspace`,
`createWorkspaceProject` (any workspace member; seeds workflow states like
`createProject`), `inviteWorkspaceMember`, `updateWorkspaceMemberRole` (owner),
`removeWorkspaceMember` (admin; only owner removes admins; never the owner),
`acceptWorkspaceInvite`. All `{ok:true,…}|{ok:false,error,field?}`.
Access via `src/lib/workspace-access.ts` (+ `getUserWorkspaces`).

## Workspace email invites (no table)
There is no `workspace_invitation` table, so the link is stateless: HMAC-SHA256
(`BETTER_AUTH_SECRET`) over `{workspaceId, email, role, exp}` (7 days).
Accepting requires the signed-in email to match. Deviation: pending workspace
invites can't be listed or revoked, and a link is reusable until it expires
(membership insert is idempotent). A real table is an orchestrator request.

## Edge cases
Slug collision → field error. Deleting a workspace un-groups its projects
(`set null`) and cascades initiatives. Owner can't leave. Moving a project from
another workspace only needs project admin — the project admin decides where
their project lives.
