<script lang="ts">
  import DeveloperSettings from '@/lib/components/developer/developer-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>GitLab, Bitbucket &amp; Sentry · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">GitLab, Bitbucket &amp; Sentry</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Connect other code hosts and error tracking. Pull and merge requests link to issues the same way
  GitHub&apos;s do — by the issue ID in the branch name or title, or magic words like “Fixes”.
</p>
<DeveloperSettings
  projectId={data.projectId}
  canEdit={data.canEdit}
  gitlab={data.gitlab}
  bitbucket={data.bitbucket}
  sentry={data.sentry}
  sentryWebhookUrl={data.sentryWebhookUrl}
  webhookBase={data.webhookBase}
  webhookUnreachable={data.webhookUnreachable}
/>
