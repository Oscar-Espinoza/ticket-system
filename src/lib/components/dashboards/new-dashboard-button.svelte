<!-- "New dashboard" button (+ palette command) opening the create dialog. -->
<script lang="ts">
  import PlusIcon from '@lucide/svelte/icons/plus';

  import { Button } from '@/lib/components/ui/button';
  import { registerPaletteCommands } from '@/lib/svelte/palette-commands.svelte';
  import DashboardDetailsDialog from './dashboard-details-dialog.svelte';

  let { projects }: { projects: { id: string; name: string }[] } = $props();

  let open = $state(false);

  $effect(() =>
    registerPaletteCommands([
      {
        id: 'new-dashboard',
        label: 'New dashboard',
        section: 'Dashboards',
        keywords: ['create', 'insights', 'charts'],
        run: () => {
          open = true;
        },
      },
    ]),
  );
</script>

<Button size="sm" onclick={() => (open = true)}>
  <PlusIcon />
  New dashboard
</Button>
<DashboardDetailsDialog bind:open {projects} />
