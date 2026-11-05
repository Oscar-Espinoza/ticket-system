<script lang="ts">
  import GithubSettings from '@/lib/components/github/github-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>GitHub · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">GitHub</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Link a repository to create branches from issues and move issues as pull requests are opened and
  merged.
</p>
<GithubSettings
  projectId={data.projectId}
  canEdit={data.canEdit}
  account={data.account}
  linkError={data.linkError}
  repo={data.repo}
  webhookRegistered={data.webhookRegistered}
  connectedByName={data.connectedByName}
  webhookUrl={data.webhookUrl}
  webhookUnreachable={data.webhookUnreachable}
  prOpenStateId={data.prOpenStateId}
  prMergeStateId={data.prMergeStateId}
/>
