<script lang="ts">
  import { m } from '@/lib/i18n';
  import SlaSettingsForm from '@/lib/components/sla/sla-settings-form.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_sla()}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_sla()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_sla_desc()}
</p>
<SlaSettingsForm projectId={data.projectId} initial={data.initial} canEdit={data.canEdit} />
