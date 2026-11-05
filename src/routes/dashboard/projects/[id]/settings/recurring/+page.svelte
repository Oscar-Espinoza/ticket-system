<script lang="ts">
  import RecurringSettings from '@/lib/components/recurring/recurring-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>Recurring issues · Ticket System</title></svelte:head>

<h1 class="text-xl font-medium">Recurring issues</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Issues created automatically on a schedule. Runs happen once a day (UTC); a missed run
  creates one issue, not a backlog.
</p>
<RecurringSettings
  projectId={data.projectId}
  items={data.items}
  canEdit={data.canEdit}
  cronConfigured={data.cronConfigured}
/>
