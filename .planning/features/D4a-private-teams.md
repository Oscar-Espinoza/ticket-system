# D4a — Private teams (project visibility)

## Goal
`project.visibility`: `'private'` (default — members only, invisible to the
rest of the workspace) or `'workspace'` (listed on the workspace page;
any workspace member can join as `member`).

## UX
- Settings → General → **Visibility** (owner/admin): radio "Private" /
  "Workspace". Hint when not in a workspace ("Only matters inside a workspace").
- Workspace page "Teams": member projects + workspace-visible ones; non-member
  workspace-visible rows show a **Join** button; private non-member projects are
  not listed at all.

## Data / actions
- `updateProjectVisibility(prev, formData{projectId, visibility})` in
  `project-settings.ts` (admin).
- `joinWorkspaceProject({workspaceId, projectId})` in `workspaces.ts`: session →
  workspace membership (by id) → project must be in that workspace AND
  `visibility = 'workspace'` → insert `project_member` role `member`
  (`onConflictDoNothing`). Private → "Project not found." (no existence leak).
- Server re-checks: joining a private project fails; no project data is exposed
  by the workspace page beyond name/key/member count for workspace-visible ones.

## Files
`project-settings.ts`, `project-general-form.tsx`, `settings/general/page.tsx`,
`workspace-projects.tsx`, `workspaces.ts`.
Integration: the workspace page must filter its project query to
`viewer is member OR visibility = 'workspace'` and pass `visibility`/`parentId`
(until then the component hides non-member rows lacking `visibility`).

## Edge cases
Project leaves the workspace → visibility irrelevant. Join races → unique
(project, user) + onConflictDoNothing. Already a member → idempotent success.
