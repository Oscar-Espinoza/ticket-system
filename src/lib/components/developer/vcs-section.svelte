<script lang="ts">
  import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import WebhookIcon from '@lucide/svelte/icons/webhook';
  import { toast } from 'svelte-sonner';

  import { projectHref } from '@/lib/components/app-shell/routes';
  import {
    disconnectIntegration,
    registerIntegrationWebhook,
    type VcsConnectResult,
  } from '@/lib/actions/developer';
  import SectionHeading from '@/lib/components/settings/section-heading.svelte';
  import { Button } from '@/lib/components/ui/button';
  import DisconnectButton from './disconnect-button.svelte';
  import type { VcsIntegrationView } from './developer-types';
  import VcsConnectForm from './vcs-connect-form.svelte';
  import { VCS_HOSTS, type VcsHostProvider } from './vcs-hosts';
  import VcsMark from './vcs-mark.svelte';

  let {
    provider,
    projectId,
    canEdit,
    integration,
  }: {
    provider: VcsHostProvider;
    projectId: string;
    canEdit: boolean;
    integration: VcsIntegrationView | null;
  } = $props();

  const copy = $derived(VCS_HOSTS[provider]);
  let pending = $state(false);
  let action = $state<'webhook' | 'disconnect' | null>(null);

  function toastConnect(result: VcsConnectResult, success: string) {
    if (!result.ok) toast.error(result.error);
    else if (result.webhook === 'registered') toast.success(success);
    else toast.warning(result.warning ?? 'Webhook not registered.');
  }

  async function run(kind: 'webhook' | 'disconnect', fn: () => Promise<void>) {
    action = kind;
    pending = true;
    try {
      await fn();
    } finally {
      action = null;
      pending = false;
    }
  }

  const reRegister = () =>
    run('webhook', async () => {
      toastConnect(await registerIntegrationWebhook({ projectId, provider }), 'Webhook registered');
    });

  const disconnect = () =>
    run('disconnect', async () => {
      const result = await disconnectIntegration({ projectId, provider });
      if (!result.ok) toast.error(result.error);
      else if (result.warning) toast.warning(result.warning);
      else toast.success(`${copy.name} disconnected`);
    });
</script>

{#snippet mark()}
  <VcsMark {provider} class="size-4 {copy.markColor}" />
{/snippet}

{#snippet headingDescription()}
  {copy.description} Issues move with the{' '}
  <a href={projectHref(projectId, 'settings/github')} class="underline underline-offset-2">
    pull request automation
  </a>{' '}
  states from the GitHub settings.
{/snippet}

<section class="flex flex-col gap-4" aria-label={copy.name}>
  <SectionHeading icon={mark} title={copy.name} description={headingDescription} />
  {#if integration}
    <div class="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div class="flex items-center gap-3">
        {@render mark()}
        <a
          href={integration.webUrl}
          target="_blank"
          rel="noreferrer"
          class="flex min-w-0 items-center gap-1 font-mono text-sm hover:underline"
        >
          <span class="truncate">{integration.repo}</span>
          <ExternalLinkIcon class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </a>
        {#if integration.baseUrl}
          <span class="hidden truncate text-xs text-muted-foreground sm:inline">
            {integration.baseUrl}
          </span>
        {/if}
        {#if integration.connectedByName}
          <span class="ml-auto shrink-0 text-xs text-muted-foreground">
            Connected by {integration.connectedByName}
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-2 text-sm">
        <WebhookIcon class="size-4 text-muted-foreground" aria-hidden="true" />
        {#if integration.webhookRegistered}
          <span class="flex items-center gap-1.5">
            <span class="size-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
            Webhook active
          </span>
        {:else}
          <span class="flex items-center gap-1.5 text-muted-foreground">
            <span class="size-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>
            Webhook not registered — {copy.pr} won&apos;t update issues.
          </span>
        {/if}
      </div>
      {#if canEdit}
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onclick={reRegister} disabled={pending}>
            {#if pending && action === 'webhook'}<Loader2Icon class="animate-spin" />{/if}
            {integration.webhookRegistered ? 'Re-register webhook' : 'Register webhook'}
          </Button>
          <DisconnectButton
            name={integration.repo}
            description={`The webhook is removed from ${copy.name} and ${copy.pr} stop updating issues. Existing links on issues are kept.`}
            disabled={pending}
            pending={pending && action === 'disconnect'}
            onConfirm={disconnect}
          />
        </div>
      {/if}
    </div>
  {:else if canEdit}
    <VcsConnectForm {provider} {projectId} />
  {:else}
    <p class="text-sm text-muted-foreground">Not connected.</p>
  {/if}
</section>
