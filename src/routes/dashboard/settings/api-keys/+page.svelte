<script lang="ts">
  import { m } from '@/lib/i18n';
  import ApiKeySettings from '@/lib/components/integrations/api-key-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const parts = $derived(
    m.settings_page_api_keys_desc({ url: '\uE000', header: '\uE001' }).split(/[\uE000\uE001]/),
  );
</script>

<svelte:head>
  <title>{m.settings_page_api_keys_title()}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_api_keys()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {parts[0]}<span class="font-mono text-xs">{data.appUrl}/api/v1</span>{parts[1]}<span class="font-mono text-xs">Authorization: Bearer lc_…</span>{parts[2]} <!-- i18n-ignore -->
</p>
<ApiKeySettings keys={data.keys} />
