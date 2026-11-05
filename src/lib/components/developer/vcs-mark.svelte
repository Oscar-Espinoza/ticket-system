<!-- The brand mark of a code host (GitHub / GitLab / Bitbucket). -->
<script lang="ts">
  import GithubMark from '@/lib/components/github/github-mark.svelte';
  import type { VcsProvider } from '@/lib/vcs/providers';
  import BitbucketMark from './bitbucket-mark.svelte';
  import GitlabMark from './gitlab-mark.svelte';

  let { provider, class: className }: { provider: VcsProvider; class?: string } = $props();
</script>

{#if provider === 'gitlab'}
  <GitlabMark class={className} />
{:else if provider === 'bitbucket'}
  <BitbucketMark class={className} />
{:else}
  <GithubMark class={className} />
{/if}
