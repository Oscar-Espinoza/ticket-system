<script lang="ts">
  import { m } from '@/lib/i18n';
  import AuthorizedApps from '@/lib/components/oauth/authorized-apps.svelte';
  import ConnectAiAssistant from '@/lib/components/oauth/connect-ai-assistant.svelte';
  import OAuthAppSettings from '@/lib/components/oauth/oauth-app-settings.svelte';
  import { Separator } from '@/lib/components/ui/separator';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const parts = $derived(m.settings_page_oauth_apps_desc({ url: '\uE000' }).split('\uE000'));
</script>

<svelte:head>
  <title>{m.settings_page_oauth_apps_title()}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_oauth_apps()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {parts[0]}<span class="font-mono text-xs">{data.origin}/api/auth/oauth2/authorize</span>{parts[1]} <!-- i18n-ignore -->
</p>
<ConnectAiAssistant mcpUrl={data.mcpUrl} />
<Separator class="my-10" />
<OAuthAppSettings origin={data.origin} apps={data.apps} />
<Separator class="my-10" />
<AuthorizedApps apps={data.consents} />
