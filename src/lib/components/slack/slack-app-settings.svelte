<!--
  Settings → Slack. Workspaces the viewer installed / linked to (where Asks
  land, uninstall), the viewer's own Slack link (DM toggle, unlink), and the
  setup guide with the exact request URLs + an app manifest.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
  import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
  import HashIcon from '@lucide/svelte/icons/hash';

  import { Button } from '@/lib/components/ui/button';
  import { cn } from '@/lib/utils';
  import SlackLinkRow from './slack-link-row.svelte';
  import SlackSetupGuide from './slack-setup-guide.svelte';
  import SlackWorkspaceRow from './slack-workspace-row.svelte';
  import type { SlackWorkspace, SlackAdminProject, SlackAppUrls } from './slack-types';

  let {
    configured,
    urls,
    manifest,
    workspaces,
    adminProjects,
    notice,
  }: {
    configured: boolean;
    urls: SlackAppUrls;
    manifest: string;
    workspaces: SlackWorkspace[];
    adminProjects: SlackAdminProject[];
    notice: { tone: 'success' | 'error'; text: string } | null;
  } = $props();

  const linked = $derived(workspaces.filter((w) => w.link));
</script>

<!-- Full-page navigation (the OAuth routes redirect to Slack); disabled until configured. -->
{#snippet linkButton(href: string, enabled: boolean, variant: 'outline' | undefined, children: Snippet)}
  {#if !enabled}
    <Button size="sm" {variant} disabled>{@render children()}</Button>
  {:else}
    <Button {href} size="sm" {variant} data-sveltekit-reload>{@render children()}</Button>
  {/if}
{/snippet}

{#snippet sectionHeader(title: string, description: string, action?: Snippet)}
  <div class="flex items-end justify-between gap-4">
    <div>
      <h2 class="text-base font-medium">{title}</h2>
      <p class="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
    {@render action?.()}
  </div>
{/snippet}

{#snippet addToSlackLabel()}
  <HashIcon />
  Add to Slack
{/snippet}
{#snippet linkAccountLabel()}Link my Slack account{/snippet}
{#snippet addToSlack()}
  {@render linkButton('/api/slack/install', configured, undefined, addToSlackLabel)}
{/snippet}
{#snippet linkAccount()}
  {@render linkButton('/api/slack/link', configured, 'outline', linkAccountLabel)}
{/snippet}

<div class="flex flex-col gap-10">
  {#if notice}
    <div
      role={notice.tone === 'error' ? 'alert' : 'status'}
      class={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
        notice.tone === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-border bg-muted/40',
      )}
    >
      {#if notice.tone === 'error'}
        <CircleAlertIcon class="mt-0.5 size-4 shrink-0" />
      {:else}
        <CircleCheckIcon class="mt-0.5 size-4 shrink-0 text-emerald-600" />
      {/if}
      {notice.text}
    </div>
  {/if}

  {#if !configured}
    <SlackSetupGuide {urls} {manifest} open />
  {/if}

  <section class="flex flex-col gap-3">
    {@render sectionHeader(
      'Workspaces',
      'Slack workspaces where /ask and the “Create issue” shortcut file issues.',
      addToSlack,
    )}
    {#if workspaces.length === 0}
      <p class="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        No Slack workspaces connected.
        {configured
          ? 'Add the app to a workspace, or link your account if it’s already installed.'
          : 'Configure the Slack app below first.'}
      </p>
    {:else}
      <ul class="divide-y rounded-lg border">
        {#each workspaces as workspace (workspace.teamId)}
          <SlackWorkspaceRow {workspace} {adminProjects} />
        {/each}
      </ul>
    {/if}
  </section>

  <section class="flex flex-col gap-3">
    {@render sectionHeader(
      'Your Slack account',
      'Link your Slack account to file Asks as yourself and get notifications as DMs.',
      linkAccount,
    )}
    {#if linked.length === 0}
      <p class="text-sm text-muted-foreground">
        Not linked. Unlinked Asks are filed to the workspace’s default project, in triage.
      </p>
    {:else}
      <ul class="divide-y rounded-lg border">
        {#each linked as workspace (workspace.teamId)}
          <SlackLinkRow {workspace} />
        {/each}
      </ul>
    {/if}
  </section>

  {#if configured}
    <SlackSetupGuide {urls} {manifest} />
  {/if}
</div>
