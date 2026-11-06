<!-- One team of the workspace: link or Join, counts, role, remove (ProjectRow in workspace-projects.tsx). -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import CornerDownRightIcon from '@lucide/svelte/icons/corner-down-right';
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import LockIcon from '@lucide/svelte/icons/lock';
  import UnlinkIcon from '@lucide/svelte/icons/unlink';
  import { toast } from 'svelte-sonner';

  import { PROJECT_ROLE_LABEL } from '@/lib/roles';
  import { joinWorkspaceProject, removeProjectFromWorkspace } from '@/lib/actions/workspaces';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { LabelChip } from '@/lib/components/ui-icons';
  import type { WorkspaceTeamRow } from './workspace-projects.svelte';

  let {
    workspaceId,
    project,
    depth,
    canRemove,
  }: {
    workspaceId: string;
    project: WorkspaceTeamRow;
    depth: number;
    canRemove: boolean;
  } = $props();

  let isPending = $state(false);
  let joining = $state(false);
  const isMember = $derived(project.viewerRole !== null);

  async function join() {
    joining = true;
    try {
      const result = await joinWorkspaceProject({ workspaceId, projectId: project.id });
      if (!result) return;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Joined ${project.name}`);
      void goto(`/dashboard/projects/${project.id}`);
    } finally {
      joining = false;
    }
  }

  async function remove() {
    isPending = true;
    try {
      const result = await removeProjectFromWorkspace({ workspaceId, projectId: project.id });
      if (!result) return;
      if (!result.ok) toast.error(result.error);
      else toast.success(`${project.name} left the workspace`);
    } finally {
      isPending = false;
    }
  }
</script>

{#snippet body()}
  <LabelChip dot={false} class="font-mono">{project.ticketKey}</LabelChip>
  <span class="truncate text-sm font-medium">{project.name}</span>
  {#if project.visibility === 'private'}
    <LockIcon aria-label="Private team" class="size-3 shrink-0 text-muted-foreground" />
  {/if}
{/snippet}

<li
  class="flex min-h-11 items-center gap-3 px-3 py-2"
  style:padding-left={depth > 0 ? `${0.75 + (depth - 1) * 1.25}rem` : undefined}
>
  {#if depth > 0}
    <CornerDownRightIcon aria-hidden="true" class="size-3.5 shrink-0 text-muted-foreground" />
  {/if}
  {#if isMember}
    <a
      href="/dashboard/projects/{project.id}"
      class="flex min-w-0 flex-1 items-center gap-2 rounded outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {@render body()}
    </a>
  {:else}
    <span class="flex min-w-0 flex-1 items-center gap-2">{@render body()}</span>
  {/if}
  <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
    {project.openCount !== null ? `${project.openCount} open · ` : ''}{project.memberCount} member{project.memberCount === 1 ? '' : 's'}
  </span>
  {#if project.viewerRole !== null}
    <span class="w-16 shrink-0 text-right text-xs text-muted-foreground">
      {PROJECT_ROLE_LABEL[project.viewerRole]}
    </span>
  {:else}
    <Button
      variant="outline"
      size="sm"
      class="h-7 w-16 shrink-0"
      disabled={joining}
      onclick={join}
      aria-label="Join {project.name}"
    >
      {#if joining}<LoaderCircleIcon class="animate-spin" />{:else}Join{/if}
    </Button>
  {/if}
  {#if canRemove}
    <DropdownMenu>
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          <Button {...props} variant="ghost" size="icon-sm" aria-label="Actions for {project.name}" disabled={isPending}>
            {#if isPending}<LoaderCircleIcon class="animate-spin" />{:else}<EllipsisIcon />{/if}
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={remove}>
          <UnlinkIcon />
          Remove from workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  {:else}
    <span class="size-7 shrink-0" aria-hidden="true"></span>
  {/if}
</li>
