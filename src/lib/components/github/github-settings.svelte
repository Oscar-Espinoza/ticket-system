<!--
  Settings → GitHub body: account (link with elevated scopes), repository +
  webhook, and PR automations. Controls hide for non-admins; the actions
  re-check the role server-side.
-->
<script lang="ts">
  import { Separator } from '@/lib/components/ui/separator';
  import GithubAccountSection from './github-account-section.svelte';
  import GithubAutomationSection from './github-automation-section.svelte';
  import GithubRepositorySection from './github-repository-section.svelte';
  import type { GithubSettingsProps } from './github-types';

  let props: GithubSettingsProps = $props();

  const ready = $derived(props.account.status === 'connected' && props.account.hasRequiredScopes);
</script>

<div class="flex flex-col">
  {#if !props.canEdit}
    <p
      class="mb-6 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
    >
      Only project owners and admins can change the GitHub connection.
    </p>
  {/if}
  <GithubAccountSection account={props.account} linkError={props.linkError} />
  <Separator class="my-10" />
  <GithubRepositorySection {...props} accountReady={ready} />
  <Separator class="my-10" />
  <GithubAutomationSection {...props} />
</div>
