<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { connectBitbucket, connectGitlab } from '@/lib/actions/developer';
  import Callout from '@/lib/components/settings/callout.svelte';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';

  const VCS_COPY = {
    gitlab: { name: 'GitLab', repoLabel: 'Project path', repoPlaceholder: 'group/project' },
    bitbucket: {
      name: 'Bitbucket',
      repoLabel: 'Repository',
      repoPlaceholder: 'workspace/repository',
    },
  } as const;

  let { provider, projectId }: { provider: 'gitlab' | 'bitbucket'; projectId: string } = $props();

  const copy = $derived(VCS_COPY[provider]);
  const id = $props.id();
  let baseUrl = $state('');
  let repo = $state('');
  let token = $state('');
  let username = $state('');
  let error = $state<string | null>(null);
  let pending = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = null;
    pending = true;
    try {
      const result =
        provider === 'gitlab'
          ? await connectGitlab({ projectId, baseUrl, repo, token })
          : await connectBitbucket({ projectId, repo, token, username });
      if (!result.ok) {
        error = result.error;
        return;
      }
      if (result.webhook === 'registered') toast.success(`Connected ${result.repo}`);
      else toast.warning(result.warning ?? 'Webhook not registered.');
      token = '';
    } finally {
      pending = false;
    }
  }
</script>

{#snippet tokenHint()}
  {#if provider === 'gitlab'}
    A personal, group or project access token with the <span class="font-mono text-xs">api</span>
    scope, from someone with the Maintainer role (needed to add the webhook). It&apos;s encrypted and
    only used to manage the webhook.
  {:else}
    A repository or workspace access token with <span class="font-mono text-xs">webhook</span> and
    <span class="font-mono text-xs">pullrequest</span> read access — or an API token / app password
    together with your username below. It&apos;s encrypted and used for the webhook and build
    statuses.
  {/if}
{/snippet}

<form onsubmit={submit} class="flex max-w-xl flex-col gap-4">
  {#if provider === 'gitlab'}
    <Field id="{id}-url" label="GitLab URL" hint="Leave empty for gitlab.com.">
      <Input
        id="{id}-url"
        placeholder="https://gitlab.com"
        bind:value={baseUrl}
        autocomplete="off"
        disabled={pending}
      />
    </Field>
  {/if}
  <Field id="{id}-repo" label={copy.repoLabel}>
    <Input
      id="{id}-repo"
      placeholder={copy.repoPlaceholder}
      bind:value={repo}
      autocomplete="off"
      required
      disabled={pending}
    />
  </Field>
  <Field id="{id}-token" label="Access token" hint={tokenHint}>
    <Input
      id="{id}-token"
      type="password"
      bind:value={token}
      autocomplete="off"
      required
      disabled={pending}
    />
  </Field>
  {#if provider === 'bitbucket'}
    <Field
      id="{id}-user"
      label="Username (optional)"
      hint="Only for API tokens (your Atlassian email) or app passwords (your Bitbucket username)."
    >
      <Input id="{id}-user" bind:value={username} autocomplete="off" disabled={pending} />
    </Field>
  {/if}
  {#if error}
    <Callout tone="error">{error}</Callout>
  {/if}
  <div>
    <Button type="submit" disabled={pending || !repo.trim() || !token.trim()}>
      {#if pending}<Loader2Icon class="animate-spin" />{/if}
      Connect {copy.name}
    </Button>
  </div>
</form>
