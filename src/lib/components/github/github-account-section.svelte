<script lang="ts">
  import { page } from '$app/state';
  import CheckIcon from '@lucide/svelte/icons/check';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { Avatar } from '@/lib/components/ui-icons';
  import { Button } from '@/lib/components/ui/button';
  import Callout from '@/lib/components/settings/callout.svelte';
  import SectionHeading from '@/lib/components/settings/section-heading.svelte';
  import { REQUIRED_SCOPES } from '@/lib/github/scopes';
  import { authClient } from '@/lib/svelte/auth-client';
  import GithubMark from './github-mark.svelte';
  import type { GithubAccountProp } from './github-types';

  let { account, linkError }: { account: GithubAccountProp; linkError: string | null } = $props();

  let pending = $state(false);

  const link = async () => {
    pending = true;
    const pathname = page.url.pathname;
    // Redirects to GitHub; the callback updates this user's GitHub account row
    // (or creates it) with the extra scopes, then returns here.
    const { error } = await authClient.linkSocial({
      provider: 'github',
      scopes: [...REQUIRED_SCOPES],
      callbackURL: pathname,
      errorCallbackURL: pathname,
    });
    if (error) {
      pending = false;
      toast.error(error.message ?? 'Could not start the GitHub connection.');
    }
  };
</script>

{#snippet linkButton(label: string, variant: 'default' | 'outline' = 'default')}
  <Button {variant} onclick={link} disabled={pending}>
    {#if pending}<Loader2Icon class="animate-spin" />{:else}<GithubMark class="size-4" />{/if}
    {label}
  </Button>
{/snippet}

<section class="flex flex-col gap-4" aria-labelledby="github-account">
  <SectionHeading
    title="Your GitHub account"
    description={`Branches and webhooks are created with your own GitHub authorization (${REQUIRED_SCOPES.join(', ')}). Your token never leaves the server.`}
  />
  {#if linkError}
    <Callout tone="error">{linkError}</Callout>
  {/if}
  {#if account.status === 'none'}
    <div>{@render linkButton('Connect GitHub')}</div>
  {/if}
  {#if account.status === 'invalid'}
    <Callout tone="warning">Your GitHub authorization expired or was revoked.</Callout>
    <div>{@render linkButton('Reconnect GitHub')}</div>
  {/if}
  {#if account.status === 'error'}
    <Callout tone="warning">GitHub couldn&apos;t be reached. Reload to try again.</Callout>
  {/if}
  {#if account.status === 'connected'}
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-3">
        <Avatar name={account.login} src={account.avatarUrl} />
        <a
          href="https://github.com/{account.login}"
          target="_blank"
          rel="noreferrer"
          class="text-sm font-medium hover:underline"
        >
          @{account.login}
        </a>
        <div class="flex flex-wrap gap-1">
          {#each account.scopes as scope (scope)}
            <span
              class="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              {scope}
            </span>
          {/each}
        </div>
      </div>
      {#if account.hasRequiredScopes}
        <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckIcon class="size-3.5 text-emerald-500" aria-hidden="true" />
          Repository access granted.
        </p>
      {:else}
        <p class="text-sm text-muted-foreground">
          Grant repository access to connect repositories and create branches.
        </p>
        <div>{@render linkButton('Grant repository access')}</div>
      {/if}
    </div>
  {/if}
</section>
