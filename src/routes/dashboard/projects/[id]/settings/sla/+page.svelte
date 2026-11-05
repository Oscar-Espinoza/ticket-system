<script lang="ts">
  import SlaSettingsForm from '@/lib/components/sla/sla-settings-form.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>SLAs · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">SLAs</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Response targets by priority. Issues show the time left, turn red once overdue, and the assignee
  and subscribers are notified when an SLA is breached.
</p>
<SlaSettingsForm projectId={data.projectId} initial={data.initial} canEdit={data.canEdit} />
