<!--
  Sidebar "Workspaces" section (B9): each workspace links to its page, with its
  Initiatives (B8) indented below. With no workspace yet it still renders a
  single "Create a workspace" row — it's the feature's only entry point
  besides the palette. The list (getUserWorkspaces) comes from the dashboard
  layout load.
-->
<script module lang="ts">
  import type { SidebarWorkspace } from '../sidebar-types';

  export interface SidebarWorkspacesProps {
    /** getUserWorkspaces(session user id), from the dashboard layout load. */
    workspaces: SidebarWorkspace[];
  }
</script>

<script lang="ts">
  import Building2Icon from '@lucide/svelte/icons/building-2';
  import TargetIcon from '@lucide/svelte/icons/target';

  import CreateWorkspaceTrigger from '@/lib/components/workspaces/create-workspace-trigger.svelte';
  import SidebarLink from '../sidebar-link.svelte';
  import SidebarSection from '../sidebar-section.svelte';

  let { workspaces }: SidebarWorkspacesProps = $props();
</script>

{#if workspaces.length === 0}
  <SidebarSection title="Workspaces">
    <CreateWorkspaceTrigger variant="row" />
  </SidebarSection>
{:else}
  <SidebarSection title="Workspaces">
    {#snippet action()}<CreateWorkspaceTrigger variant="icon" />{/snippet}
    {#each workspaces as workspace (workspace.id)}
      {@const href = `/dashboard/workspaces/${workspace.slug}`}
      <div class="flex flex-col gap-px">
        <SidebarLink {href} label={workspace.name} exact>
          {#snippet icon()}<Building2Icon />{/snippet}
        </SidebarLink>
        <SidebarLink href={`${href}/initiatives`} label="Initiatives" indent>
          {#snippet icon()}<TargetIcon />{/snippet}
        </SidebarLink>
      </div>
    {/each}
  </SidebarSection>
{/if}
