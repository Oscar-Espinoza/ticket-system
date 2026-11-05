<!--
  Sidebar entry point: the dialog, its trigger (a `+` next to the section
  heading, or a full row when the user has no workspace yet) and the global
  "Create workspace" palette command.
-->
<script lang="ts">
  import PlusIcon from '@lucide/svelte/icons/plus';

  import { sidebarRowClass } from '@/lib/components/app-shell/sidebar-nav';
  import { registerPaletteCommands } from '@/lib/svelte/palette-commands.svelte';
  import { cn } from '@/lib/utils';
  import CreateWorkspaceDialog from './create-workspace-dialog.svelte';

  let { variant }: { variant: 'icon' | 'row' } = $props();

  let open = $state(false);

  $effect(() =>
    registerPaletteCommands([
      {
        id: 'workspace.create',
        label: 'Create workspace',
        section: 'Workspaces',
        keywords: ['new', 'workspace', 'team', 'organization'],
        run: () => (open = true),
      },
    ]),
  );
</script>

{#if variant === 'icon'}
  <button
    type="button"
    onclick={() => (open = true)}
    aria-label="Create workspace"
    class="flex size-5 items-center justify-center rounded text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
  >
    <PlusIcon class="size-3.5" />
  </button>
{:else}
  <button
    type="button"
    onclick={() => (open = true)}
    class={cn(sidebarRowClass, 'text-muted-foreground hover:bg-sidebar-accent/60')}
  >
    <PlusIcon />
    <span class="truncate">Create a workspace</span>
  </button>
{/if}
<CreateWorkspaceDialog bind:open />
