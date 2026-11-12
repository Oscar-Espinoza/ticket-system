<script lang="ts">
  import AuthorizedApps from '@/lib/components/oauth/authorized-apps.svelte';
  import ConnectAiAssistant from '@/lib/components/oauth/connect-ai-assistant.svelte';
  import OAuthAppSettings from '@/lib/components/oauth/oauth-app-settings.svelte';
  import { Separator } from '@/lib/components/ui/separator';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>OAuth apps · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">OAuth apps</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Let other apps act on your behalf through the REST and GraphQL APIs using OAuth 2.0
  (authorization code + PKCE). Authorize at
  <span class="font-mono text-xs">{data.origin}/api/auth/oauth2/authorize</span>.
</p>
<ConnectAiAssistant mcpUrl={data.mcpUrl} />
<Separator class="my-10" />
<OAuthAppSettings origin={data.origin} apps={data.apps} />
<Separator class="my-10" />
<AuthorizedApps apps={data.consents} />
