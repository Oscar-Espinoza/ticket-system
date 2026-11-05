<!-- Slack + outgoing webhooks (B11). Admin only. -->
<script lang="ts">
  import SlackSettings from '@/lib/components/integrations/slack-settings.svelte';
  import WebhookSettings from '@/lib/components/integrations/webhook-settings.svelte';
  import { Separator } from '@/lib/components/ui/separator';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Slack &amp; webhooks · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">Slack &amp; webhooks</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Send issue activity from {data.projectName} to Slack and your own services.
</p>

{#if !data.isAdmin}
  <p
    class="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
  >
    Only project owners and admins can manage integrations.
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
