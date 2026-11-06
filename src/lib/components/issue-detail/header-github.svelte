<!--
  Issue header git menu — copy git branch name (⌘⇧.), create
  the branch on the connected GitHub repository with the viewer's own token,
  and open the branch on whichever code host the project uses (GitHub, GitLab
  or Bitbucket).
-->
<script module lang="ts">
  const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
</script>

<script lang="ts">
  import CopyIcon from '@lucide/svelte/icons/copy';
  import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
  import GitBranchIcon from '@lucide/svelte/icons/git-branch';
  import GitBranchPlusIcon from '@lucide/svelte/icons/git-branch-plus';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';

  import { createBranch, saveBranchName } from '@/lib/actions/github';
  import VcsMark from '@/lib/components/developer/vcs-mark.svelte';
  import { useVcsConnections } from '@/lib/components/developer/use-vcs-connections.svelte';
  import { useGithubViewer } from '@/lib/components/github/use-github-viewer.svelte';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/lib/components/ui/tooltip';
  import { branchNameFor, branchPrefix } from '@/lib/github/branch';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import type { IssueRow } from '@/lib/issue-model';
  import { registerPaletteCommands } from '@/lib/svelte/palette-commands.svelte';
  import { branchUrl, VCS_PROVIDER_LABEL } from '@/lib/vcs/providers';

  let { issue }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const data = useProjectData();
  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
  const githubViewer = useGithubViewer(() => data.project.id);
  const vcsConnections = useVcsConnections(() => data.project.id);
  let creating = $state(false);

  const github = $derived(githubViewer.current);
  const repo = $derived(github?.repo ?? data.project.githubRepo);
  // GitHub when connected, else the first other code host; branch creation
  // stays GitHub-only and hides when the project lives elsewhere.
  const host = $derived(
    repo
      ? { provider: 'github' as const, webUrl: `https://github.com/${repo}` }
      : (vcsConnections.current?.find((c) => c.provider !== 'github') ?? null),
  );
  const offersCreate = $derived(!host || host.provider === 'github');
  const branch = $derived(
    issue.githubBranch ?? branchNameFor(branchPrefix(github?.login, data.viewer.name), issue.key, issue.title),
  );

  const createDisabledReason = $derived(
    !repo
      ? 'Connect a repository in Settings → GitHub'
      : !canWrite
        ? "You don't have permission to create branches"
        : github && !github.connected
          ? 'Connect your GitHub account in Settings → GitHub'
          : null,
  );

  function copy() {
    // Synchronous with the click / keypress: clipboard writes need the gesture.
    const name = branch;
    navigator.clipboard.writeText(name).then(
      () => toast.success('Copied git branch name', { description: name }),
      () => toast.error("Couldn't copy to the clipboard"),
    );
    if (!issue.githubBranch && canWrite) {
      void saveBranchName({ projectId: data.project.id, ticketId: issue.id, name }).then((result) => {
        if (!result.ok) console.error('[github] saveBranchName failed', result.error);
      });
    }
  }

  async function create() {
    if (createDisabledReason) {
      toast.error(createDisabledReason);
      return;
    }
    creating = true;
    try {
      const result = await createBranch({ projectId: data.project.id, ticketId: issue.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.existed ? 'Branch already exists on GitHub' : 'Branch created', {
        description: result.branch,
        action: { label: 'Open', onClick: () => window.open(result.url, '_blank', 'noopener') },
      });
    } finally {
      creating = false;
    }
  }

  // Re-registered when the issue or the create option changes; handlers always run the latest copy/create.
  $effect(() => {
    void issue.id;
    const withCreate = offersCreate;
    return untrack(() => {
      // Shift hotkeys also match the physical key, so ⌘⇧. works where Shift turns "." into ">".
      const unregisterKeys = registerHotkeys([
        { key: '.', mod: true, shift: true, scope: 'Issue', description: 'Copy git branch name', handler: () => copy() },
      ]);
      const unregisterCommands = registerPaletteCommands([
        { id: 'github.copy-branch', label: 'Copy git branch name', section: 'Issue', keywords: ['git', 'branch'], run: () => copy() },
        ...(withCreate
          ? [{ id: 'github.create-branch', label: 'Create branch on GitHub', section: 'Issue', keywords: ['git', 'branch', 'github'], run: () => void create() }]
          : []),
      ]);
      return () => {
        unregisterKeys();
        unregisterCommands();
      };
    });
  });
</script>

{#snippet createItem()}
  <DropdownMenuItem
    disabled={!!createDisabledReason || creating}
    onSelect={(event: Event) => {
      event.preventDefault(); // keep the menu's spinner visible until done
      void create();
    }}
  >
    {#if creating}<Loader2Icon class="animate-spin" />{:else}<GitBranchPlusIcon />{/if}
    Create branch on GitHub
  </DropdownMenuItem>
{/snippet}

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button {...props} variant="ghost" size="icon-sm" aria-label="Git branch">
        <GitBranchIcon />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" class="w-64">
    <DropdownMenuLabel class="flex items-center gap-1.5 font-mono text-xs font-normal text-muted-foreground">
      <VcsMark provider={host?.provider ?? 'github'} class="size-3.5 shrink-0" />
      <span class="truncate" title={branch}>
        {branch}
      </span>
    </DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={copy}>
      <CopyIcon />
      Copy git branch name
      <DropdownMenuShortcut>{isMac() ? '⌘⇧.' : 'Ctrl+Shift+.'}</DropdownMenuShortcut>
    </DropdownMenuItem>
    {#if offersCreate}
      {#if createDisabledReason}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              {#snippet child({ props })}
                <!-- Disabled items ignore the pointer; the wrapper carries the tooltip. -->
                <div {...props}>{@render createItem()}</div>
              {/snippet}
            </TooltipTrigger>
            <TooltipContent side="left">{createDisabledReason}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      {:else}
        {@render createItem()}
      {/if}
    {/if}
    {#if issue.githubBranch && host}
      <DropdownMenuItem>
        {#snippet child({ props })}
          <a {...props} href={branchUrl(host.provider, host.webUrl, issue.githubBranch!)} target="_blank" rel="noreferrer">
            <ExternalLinkIcon />
            Open branch on {VCS_PROVIDER_LABEL[host.provider]}
          </a>
        {/snippet}
      </DropdownMenuItem>
    {/if}
  </DropdownMenuContent>
</DropdownMenu>
