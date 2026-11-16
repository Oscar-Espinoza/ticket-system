<script lang="ts">
  import { m } from '@/lib/i18n';
  import AutomationSettingsForm from '@/lib/components/cycles/automation-settings-form.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_automations()}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_automations()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_automations_desc()}
</p>
<AutomationSettingsForm
  projectId={data.projectId}
  initial={data.initial}
  lastRunAt={data.lastRunAt}
  canEdit={data.canEdit}
/>
