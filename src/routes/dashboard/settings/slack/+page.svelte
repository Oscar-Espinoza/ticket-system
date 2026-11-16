<script lang="ts">
  import { m } from '@/lib/i18n';
  import SlackAppSettings from '@/lib/components/slack/slack-app-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const parts = $derived(m.settings_page_slack_desc({ ask: '\uE000' }).split('\uE000'));
</script>

<svelte:head>
  <title>Slack · Ticket System</title> <!-- i18n-ignore -->
</svelte:head>

<h1 class="text-xl font-medium">Slack</h1> <!-- i18n-ignore -->
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {parts[0]}<span class="font-mono text-xs">/ask</span>{parts[1]} <!-- i18n-ignore -->
</p>
<SlackAppSettings
  configured={data.configured}
  urls={data.urls}
  manifest={data.manifest}
  workspaces={data.workspaces}
  adminProjects={data.adminProjects}
  notice={data.notice}
/>
