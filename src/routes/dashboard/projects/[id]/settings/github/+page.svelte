<script lang="ts">
  import { m } from '@/lib/i18n';
  import GithubSettings from '@/lib/components/github/github-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>GitHub</title> <!-- i18n-ignore -->
</svelte:head>

<h1 class="text-xl font-medium">GitHub</h1> <!-- i18n-ignore -->
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_github_desc()}
</p>
<GithubSettings
  projectId={data.projectId}
  canEdit={data.canEdit}
  account={data.account}
  oauthConfigured={data.oauthConfigured}
  linkError={data.linkError}
  repo={data.repo}
  webhookRegistered={data.webhookRegistered}
  connectedByName={data.connectedByName}
  webhookUrl={data.webhookUrl}
  webhookUnreachable={data.webhookUnreachable}
  prOpenStateId={data.prOpenStateId}
  prMergeStateId={data.prMergeStateId}
/>
