<script lang="ts">
  import PlanningSettingsForm from '@/lib/components/cycles/planning-settings-form.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Cycles &amp; triage · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">Cycles &amp; triage</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  How this project plans work and reviews incoming issues.
</p>
<PlanningSettingsForm
  projectId={data.projectId}
  initial={data.initial}
  canEdit={data.canEdit}
  hasCycles={data.hasCycles}
/>
