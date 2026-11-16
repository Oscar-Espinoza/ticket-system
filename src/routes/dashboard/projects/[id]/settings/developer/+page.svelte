<script lang="ts">
  import { m } from '@/lib/i18n';
  import DeveloperSettings from '@/lib/components/developer/developer-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>GitLab, Bitbucket &amp; Sentry</title> <!-- i18n-ignore -->
</svelte:head>

<h1 class="text-xl font-medium">GitLab, Bitbucket &amp; Sentry</h1> <!-- i18n-ignore -->
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_developer_desc()}
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
