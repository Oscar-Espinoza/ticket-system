<script lang="ts">
  import { m } from '@/lib/i18n';
  import RecurringSettings from '@/lib/components/recurring/recurring-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>{m.settings_page_recurring()}</title></svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_recurring()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_recurring_desc()}
</p>
<RecurringSettings
  projectId={data.projectId}
  items={data.items}
  canEdit={data.canEdit}
  cronConfigured={data.cronConfigured}
/>
