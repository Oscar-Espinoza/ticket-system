<!--
  Workspace › Teams: the workspace's projects, "Add project" (projects the
  viewer administers) and "New project" (created inside the workspace).
  Projects the viewer isn't a member of show their name only, and only when
  they're workspace-visible (with a Join button); private ones stay hidden.
  Sub-teams are listed under their parent.
-->
<script lang="ts">
  import FolderPlusIcon from '@lucide/svelte/icons/folder-plus';
  import PlusIcon from '@lucide/svelte/icons/plus';

  import { workspaceRoleAllows, type EligibleProject, type WorkspaceRole } from '@/lib/workspace-types';
  import { MAX_DEPTH } from '@/lib/components/project-tree';
  import { Button } from '@/lib/components/ui/button';
  import { EmptyState } from '@/lib/components/ui-icons';
  import { roleAllows } from '@/lib/roles';
  import WorkspaceAddProjectDialog from './workspace-add-project-dialog.svelte';
  import WorkspaceCreateProjectDialog from './workspace-create-project-dialog.svelte';
  import WorkspaceProjectRowView from './workspace-project-row.svelte';
  import type { WorkspaceTeamRow } from './workspace-project-types';

  let {
    workspaceId,
    projects: allProjects,
    eligible,
    role,
  }: {
    workspaceId: string;
    projects: WorkspaceTeamRow[];
    eligible: EligibleProject[];
    role: WorkspaceRole;
  } = $props();

  /**
   * Visible rows in tree order with their depth: private projects the viewer
   * isn't in are dropped (the server should not send them at all; this is the
   * backstop), sub-teams follow their parent. Orphans / cycles go top level.
   */
  function teamTree(rows: WorkspaceTeamRow[]): { project: WorkspaceTeamRow; depth: number }[] {
    const visible = rows.filter((p) => p.viewerRole !== null || p.visibility === 'workspace');
    const ids = new Set(visible.map((p) => p.id));
    const childrenOf = new Map<string, WorkspaceTeamRow[]>();
    const roots: WorkspaceTeamRow[] = [];
    for (const project of visible) {
      const parentId = project.parentId;
      if (parentId && parentId !== project.id && ids.has(parentId)) {
        childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), project]);
      } else {
        roots.push(project);
      }
    }
    const out: { project: WorkspaceTeamRow; depth: number }[] = [];
    const seen = new Set<string>();
    const walk = (list: WorkspaceTeamRow[], depth: number) => {
      for (const project of list) {
        if (seen.has(project.id)) continue;
        seen.add(project.id);
        out.push({ project, depth });
        if (depth < MAX_DEPTH) walk(childrenOf.get(project.id) ?? [], depth + 1);
      }
    };
    walk(roots, 0);
    walk(
      visible.filter((p) => !seen.has(p.id)),
      0,
    );
    return out;
  }

  let dialog = $state<'add' | 'create' | null>(null);
  const isAdmin = $derived(workspaceRoleAllows(role, 'admin'));
  const tree = $derived(teamTree(allProjects));
</script>

<section aria-labelledby="workspace-projects">
  <div class="mb-3 flex items-center gap-2">
    <h2 id="workspace-projects" class="text-base font-medium">
      Teams <span class="text-muted-foreground">· {tree.length}</span>
    </h2>
    <div class="ml-auto flex gap-2">
      {#if isAdmin}
        <Button variant="outline" size="sm" onclick={() => (dialog = 'add')}>
          <FolderPlusIcon />
          Add project
        </Button>
      {/if}
      <Button size="sm" onclick={() => (dialog = 'create')}>
        <PlusIcon />
        New project
      </Button>
    </div>
  </div>

  {#if tree.length === 0}
    <EmptyState
      class="rounded-lg border"
      title="No projects yet"
      description={isAdmin
        ? 'Add one of your projects or create a new one in this workspace.'
        : 'Create a project in this workspace to get started.'}
    >
      {#snippet icon()}<FolderPlusIcon />{/snippet}
    </EmptyState>
  {:else}
    <ul class="flex flex-col divide-y divide-border/60 rounded-lg border">
      {#each tree as { project, depth } (project.id)}
        <WorkspaceProjectRowView
          {workspaceId}
          {project}
          {depth}
          canRemove={isAdmin || (project.viewerRole !== null && roleAllows(project.viewerRole, 'admin'))}
        />
      {/each}
    </ul>
  {/if}

  <WorkspaceAddProjectDialog
    open={dialog === 'add'}
    onClose={() => (dialog = null)}
    {workspaceId}
    {eligible}
  />
  <WorkspaceCreateProjectDialog open={dialog === 'create'} onClose={() => (dialog = null)} {workspaceId} />
</section>
