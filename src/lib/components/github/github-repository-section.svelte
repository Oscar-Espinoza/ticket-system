<script lang="ts">
  import { m } from '@/lib/i18n';
  import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import UnplugIcon from '@lucide/svelte/icons/unplug';
  import WebhookIcon from '@lucide/svelte/icons/webhook';
  import { toast } from 'svelte-sonner';

  import {
    connectRepository,
    disconnectRepository,
    registerWebhook,
    type ConnectResult,
  } from '@/lib/actions/github';
  import Callout from '@/lib/components/settings/callout.svelte';
  import SectionHeading from '@/lib/components/settings/section-heading.svelte';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import GithubMark from './github-mark.svelte';
  import RepoPicker from './repo-picker.svelte';
  import type { GithubSettingsProps } from './github-types';
  import { useWebhookHealth } from './use-webhook-health.svelte';

  let {
    projectId,
    canEdit,
    accountReady,
    repo,
    webhookRegistered,
    connectedByName,
    webhookUrl,
    webhookUnreachable,
  }: GithubSettingsProps & { accountReady: boolean } = $props();

  type Action = 'connect' | 'webhook' | 'disconnect';

  let selected = $state<string | null>(null);
  let pending = $state(false);
  let action = $state<Action | null>(null);
  const health = useWebhookHealth(
    () => projectId,
    () => !!repo && webhookRegistered && canEdit && accountReady,
  );

  function toastConnect(result: ConnectResult, success: string) {
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.webhook === 'registered') toast.success(success);
    else toast.warning(result.warning ?? m.settings_dev_webhook_not_registered());
  }

  async function run(kind: Action, fn: () => Promise<void>) {
    action = kind;
    pending = true;
    try {
      await fn();
    } finally {
      action = null;
      pending = false;
    }
  }

  const connect = () =>
    run('connect', async () => {
      if (!selected) return;
      const result = await connectRepository({ projectId, repo: selected });
      toastConnect(result, m.settings_github_repo_connected_toast({ repo: result.ok ? result.repo : selected }));
      if (result.ok) selected = null;
    });

  const reRegister = () =>
    run('webhook', async () => {
      const result = await registerWebhook(projectId);
      toastConnect(result, m.settings_github_webhook_registered_toast());
      if (result.ok && result.webhook === 'registered') health.markCurrent();
    });

  const disconnect = () =>
    run('disconnect', async () => {
      const result = await disconnectRepository(projectId);
      if (!result.ok) toast.error(result.error);
      else if (result.warning) toast.warning(result.warning);
      else toast.success(m.settings_github_repo_disconnected_toast());
    });
</script>

<section class="flex flex-col gap-4" aria-labelledby="github-repo">
  <SectionHeading
    title={m.settings_github_repo_title()}
    description={m.settings_github_repo_desc()}
  />

  {#if webhookUnreachable}
    <Callout tone="warning">
      {m.settings_github_webhook_unreachable({ url: webhookUrl })}
    </Callout>
  {/if}

  {#if repo}
    <div class="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div class="flex items-center gap-3">
        <GithubMark class="size-4 shrink-0" />
        <a
          href="https://github.com/{repo}"
          target="_blank"
          rel="noreferrer"
          class="flex min-w-0 items-center gap-1 font-mono text-sm hover:underline"
        >
          <span class="truncate">{repo}</span>
          <ExternalLinkIcon class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </a>
        {#if connectedByName}
          <span class="ml-auto shrink-0 text-xs text-muted-foreground">
            {m.settings_dev_connected_by({ name: connectedByName })}
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-2 text-sm">
        <WebhookIcon class="size-4 text-muted-foreground" aria-hidden="true" />
        {#if webhookRegistered}
          <span class="flex items-center gap-1.5">
            <span class="size-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
            {m.settings_dev_webhook_active()}
          </span>
        {:else}
          <span class="flex items-center gap-1.5 text-muted-foreground">
            <span class="size-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>
            {m.settings_github_webhook_not_registered()}
          </span>
        {/if}
      </div>
      {#if health.status === 'outdated'}
        <Callout tone="warning">
          <span class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>
              {m.settings_github_webhook_outdated()}
            </span>
            <Button size="xs" variant="outline" onclick={health.update} disabled={health.updating}>
              {#if health.updating}<Loader2Icon class="animate-spin" />{/if}
              {m.settings_github_update_webhook()}
            </Button>
          </span>
        </Callout>
      {/if}
      {#if health.status === 'missing'}
        <Callout tone="warning">
          {m.settings_github_webhook_missing()}
        </Callout>
      {/if}
      {#if canEdit}
        <div class="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onclick={reRegister}
            disabled={pending || !accountReady}
            title={accountReady ? undefined : m.settings_github_connect_account_first()}
          >
            {#if pending && action === 'webhook'}<Loader2Icon class="animate-spin" />{/if}
            {webhookRegistered ? m.settings_dev_reregister_webhook() : m.settings_dev_register_webhook()}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="sm" disabled={pending}>
                  {#if pending && action === 'disconnect'}
                    <Loader2Icon class="animate-spin" />
                  {:else}
                    <UnplugIcon />
                  {/if}
                  {m.settings_dev_disconnect()}
                </Button>
              {/snippet}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{m.settings_dev_disconnect_title({ name: repo })}</AlertDialogTitle>
                <AlertDialogDescription>
                  {m.settings_github_disconnect_desc()}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onclick={disconnect}>
                  {m.settings_dev_disconnect()}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      {/if}
    </div>
  {:else if canEdit}
    {#if accountReady}
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <RepoPicker
          {projectId}
          value={selected}
          onChange={(next) => (selected = next)}
          disabled={pending}
        />
        <Button onclick={connect} disabled={!selected || pending}>
          {#if pending && action === 'connect'}<Loader2Icon class="animate-spin" />{/if}
          {m.settings_github_connect_repo()}
        </Button>
      </div>
    {:else}
      <p class="text-sm text-muted-foreground">
        {m.settings_github_connect_account_hint()}
      </p>
    {/if}
  {:else}
    <p class="text-sm text-muted-foreground">{m.settings_github_no_repo()}</p>
  {/if}
</section>
