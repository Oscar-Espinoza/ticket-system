<!-- Slack + outgoing webhooks (B11). Admin only. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import SlackSettings from '@/lib/components/integrations/slack-settings.svelte';
  import WebhookSettings from '@/lib/components/integrations/webhook-settings.svelte';
  import { Separator } from '@/lib/components/ui/separator';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_integrations()}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_integrations()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_integrations_desc({ name: data.projectName })}
</p>

{#if !data.isAdmin}
  <p
    class="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
  >
    {m.settings_page_integrations_admin()}
  </p>
{:else}
  <SlackSettings
    projectId={data.projectId}
    url={data.slack?.url ?? ''}
    events={data.slack?.events ?? []}
  />
  <Separator class="my-10" />
  <WebhookSettings projectId={data.projectId} webhooks={data.hooks} />
{/if}
