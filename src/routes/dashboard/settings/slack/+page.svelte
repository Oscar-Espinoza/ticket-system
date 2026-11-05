<script lang="ts">
  import SlackAppSettings from '@/lib/components/slack/slack-app-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Slack · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">Slack</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  File issues from Slack with <span class="font-mono text-xs">/ask</span> or the “Create issue” message
  shortcut, and get your notifications as Slack DMs.
</p>
<SlackAppSettings
  configured={data.configured}
  urls={data.urls}
  manifest={data.manifest}
  workspaces={data.workspaces}
  adminProjects={data.adminProjects}
  notice={data.notice}
/>
