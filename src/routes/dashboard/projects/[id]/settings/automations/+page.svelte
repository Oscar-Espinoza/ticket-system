<script lang="ts">
  import AutomationSettingsForm from '@/lib/components/cycles/automation-settings-form.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Automations · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">Automations</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Keep the backlog tidy. Automations run at most once a day, when someone opens the project.
</p>
<AutomationSettingsForm
  projectId={data.projectId}
  initial={data.initial}
  lastRunAt={data.lastRunAt}
  canEdit={data.canEdit}
/>
