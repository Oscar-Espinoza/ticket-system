<script lang="ts">
  import ApiKeySettings from '@/lib/components/integrations/api-key-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>API keys · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">API keys</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Personal keys for the REST API at
  <span class="font-mono text-xs">{data.appUrl}/api/v1</span>. Send them as
  <span class="font-mono text-xs">Authorization: Bearer lc_…</span>.
</p>
<ApiKeySettings keys={data.keys} />
