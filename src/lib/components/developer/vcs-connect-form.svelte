<script lang="ts">
  import { m } from '@/lib/i18n';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { connectBitbucket, connectGitlab } from '@/lib/actions/developer';
  import Callout from '@/lib/components/settings/callout.svelte';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';

  import { VCS_HOSTS, type VcsHostProvider } from './vcs-hosts';

  let { provider, projectId }: { provider: VcsHostProvider; projectId: string } = $props();

  const copy = $derived(VCS_HOSTS[provider]);
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
      if (result.webhook === 'registered') toast.success(m.settings_dev_connected_repo_toast({ repo: result.repo }));
      else toast.warning(result.warning ?? m.settings_dev_webhook_not_registered());
      token = '';
    } finally {
      pending = false;
    }
  }
</script>

{#snippet tokenHint()}
  {#if provider === 'gitlab'}
    {m.settings_dev_vcs_token_hint_gitlab()}
  {:else}
    {m.settings_dev_vcs_token_hint_bitbucket()}
  {/if}
{/snippet}

<form onsubmit={submit} class="flex max-w-xl flex-col gap-4">
  {#if copy.baseUrlField}
    <Field id="{id}-url" label={m.settings_dev_gitlab_url()} hint={m.settings_dev_gitlab_url_hint()}>
      <Input
        id="{id}-url"
        placeholder={'https://gitlab.com'}
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
  <Field id="{id}-token" label={m.settings_dev_access_token()} hint={tokenHint}>
    <Input
      id="{id}-token"
      type="password"
      bind:value={token}
      autocomplete="off"
      required
      disabled={pending}
    />
  </Field>
  {#if copy.usernameField}
    <Field
      id="{id}-user"
      label={m.settings_dev_username_optional()}
      hint={m.settings_dev_username_hint()}
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
      {m.settings_dev_connect_host({ name: copy.name })}
    </Button>
  </div>
</form>
