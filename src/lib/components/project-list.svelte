<!--
  Project list for the authenticated user (port of the ProjectList server
  component in src/components/project-list.tsx; its query is
  project-list.server.ts → getProjectsForUser, run by the dashboard page load).

  Renders inside the dashboard content seam (no full-page wrapper).
  Shows: section header + "New project" CTA, then dense project rows or an
  EmptyState with a CTA.
-->
<script module lang="ts">
  const ROLE_LABEL = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
    guest: 'Guest',
  } as const;
</script>

<script lang="ts">
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import FolderPlusIcon from '@lucide/svelte/icons/folder-plus';

  import CreateProjectDialog from '@/lib/components/create-project-dialog.svelte';
  import type { UserProject } from '@/lib/components/project-list.server';
  import { EmptyState, LabelChip } from '@/lib/components/ui-icons';

  let {
    projects: userProjects,
  }: {
    /** getProjectsForUser(session user id) — membership-filtered server-side (T-02-07/08). */
    projects: UserProject[];
  } = $props();
</script>

<div class="mt-8">
  <!-- Section header — always visible regardless of empty state -->
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-base font-medium">Projects</h3>
    <CreateProjectDialog />
  </div>

  {#if userProjects.length === 0}
    <EmptyState title="No projects yet" description="Create your first project to get started.">
      {#snippet icon()}<FolderPlusIcon />{/snippet}
      {#snippet action()}<CreateProjectDialog />{/snippet}
    </EmptyState>
  {:else}
    <ul class="flex flex-col">
      {#each userProjects as p (p.id)}
        <li>
          <a
            href={`/dashboard/projects/${p.id}`}
            class="group flex h-9 items-center gap-3 rounded-md px-2 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none"
          >
            <!-- Left: name + mono key chip + role chip -->
            <div class="flex min-w-0 items-center gap-2">
              <span class="truncate text-sm font-medium">{p.name}</span>
              <LabelChip dot={false} class="shrink-0 font-mono">
                {p.ticketKey}
              </LabelChip>
              <LabelChip color={p.role === 'owner' ? 'primary' : 'default'} class="shrink-0">
                {ROLE_LABEL[p.role]}
              </LabelChip>
            </div>

            <!-- Right: tabular ticket counts + hover chevron -->
            <span class="ml-auto shrink-0 text-xs tabular-nums whitespace-nowrap text-muted-foreground">
              {p.openCount} open · {p.resolvedCount} resolved
            </span>
            <ChevronRightIcon
              aria-hidden="true"
              class="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>
