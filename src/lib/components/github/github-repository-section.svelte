<script lang="ts">
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
    else toast.warning(result.warning ?? 'Webhook not registered.');
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
      toastConnect(result, `Connected ${result.ok ? result.repo : selected}`);
      if (result.ok) selected = null;
    });

  const reRegister = () =>
    run('webhook', async () => {
      const result = await registerWebhook(projectId);
      toastConnect(result, 'Webhook registered');
      if (result.ok && result.webhook === 'registered') health.markCurrent();
    });

  const disconnect = () =>
    run('disconnect', async () => {
      const result = await disconnectRepository(projectId);
      if (!result.ok) toast.error(result.error);
      else if (result.warning) toast.warning(result.warning);
      else toast.success('Repository disconnected');
    });
</script>

<section class="flex flex-col gap-4" aria-labelledby="github-repo">
  <SectionHeading
    title="Repository"
    description="Issues link to pull requests in this repository, and branches are created here."
  />

  {#if webhookUnreachable}
    <Callout tone="warning">
      GitHub can&apos;t deliver webhooks to <span class="font-mono text-xs">{webhookUrl}</span>.
      Branches still work, but pull request automation needs a public URL — set{' '}
      <span class="font-mono text-xs">PUBLIC_APP_URL</span> (or{' '}
      <span class="font-mono text-xs">GITHUB_WEBHOOK_BASE_URL</span> for a tunnel) and register the
      webhook again.
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
            Connected by {connectedByName}
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-2 text-sm">
        <WebhookIcon class="size-4 text-muted-foreground" aria-hidden="true" />
        {#if webhookRegistered}
          <span class="flex items-center gap-1.5">
            <span class="size-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
            Webhook active
          </span>
        {:else}
          <span class="flex items-center gap-1.5 text-muted-foreground">
            <span class="size-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>
            Webhook not registered — pull requests won&apos;t update issues.
          </span>
        {/if}
      </div>
      {#if health.status === 'outdated'}
        <Callout tone="warning">
          <span class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>
              The webhook doesn&apos;t send review and CI events yet, so pull requests can&apos;t
              show approval and check status.
            </span>
            <Button size="xs" variant="outline" onclick={health.update} disabled={health.updating}>
              {#if health.updating}<Loader2Icon class="animate-spin" />{/if}
              Update webhook
            </Button>
          </span>
        </Callout>
      {/if}
      {#if health.status === 'missing'}
        <Callout tone="warning">
          The webhook was removed on GitHub. Register it again to keep pull requests in sync.
        </Callout>
      {/if}
      {#if canEdit}
        <div class="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onclick={reRegister}
            disabled={pending || !accountReady}
            title={accountReady
              ? undefined
              : 'Connect your GitHub account with repository access first'}
          >
            {#if pending && action === 'webhook'}<Loader2Icon class="animate-spin" />{/if}
            {webhookRegistered ? 'Re-register webhook' : 'Register webhook'}
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
                  Disconnect
                </Button>
              {/snippet}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect {repo}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The webhook is removed from GitHub and pull requests stop updating issues.
                  Existing links and branch names on issues are kept.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onclick={disconnect}>
                  Disconnect
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
          Connect repository
        </Button>
      </div>
    {:else}
      <p class="text-sm text-muted-foreground">
        Connect your GitHub account with repository access above to pick a repository.
      </p>
    {/if}
  {:else}
    <p class="text-sm text-muted-foreground">No repository connected.</p>
  {/if}
</section>
