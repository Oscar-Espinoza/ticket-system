'use client';

// Owner: B3. Issue header GitHub menu — copy git branch name (⌘⇧.) and create
// the branch on the connected repository with the viewer's own token.

import { useEffect, useEffectEvent, useTransition } from 'react';
import { Copy, ExternalLink, GitBranch, GitBranchPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { createBranch, saveBranchName } from '@/app/actions/github';
import { GithubMark } from '@/components/github/github-mark';
import { useGithubViewer } from '@/components/github/use-github-viewer';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { branchNameFor, branchPrefix } from '@/lib/github/branch';
import { registerHotkeys } from '@/lib/hotkeys';
import type { IssueRow } from '@/lib/issue-model';
import { registerPaletteCommands } from '@/lib/palette-commands';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export function HeaderGithub({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  void mutations;
  const { project, viewer } = useProjectData();
  const canWrite = useProjectPermission('write');
  const github = useGithubViewer(project.id);
  const [creating, startCreate] = useTransition();

  const repo = github?.repo ?? project.githubRepo;
  const branch =
    issue.githubBranch ??
    branchNameFor(branchPrefix(github?.login, viewer.name), issue.key, issue.title);

  const createDisabledReason = !repo
    ? 'Connect a repository in Settings → GitHub'
    : !canWrite
      ? "You don't have permission to create branches"
      : github && !github.connected
        ? 'Connect your GitHub account in Settings → GitHub'
        : null;

  const copy = () => {
    // Synchronous with the click / keypress: clipboard writes need the gesture.
    navigator.clipboard.writeText(branch).then(
      () => toast.success('Copied git branch name', { description: branch }),
      () => toast.error("Couldn't copy to the clipboard"),
    );
    if (!issue.githubBranch && canWrite) {
      void saveBranchName({ projectId: project.id, ticketId: issue.id, name: branch }).then((result) => {
        if (!result.ok) console.error('[github] saveBranchName failed', result.error);
      });
    }
  };

  const create = () => {
    if (createDisabledReason) {
      toast.error(createDisabledReason);
      return;
    }
    startCreate(async () => {
      const result = await createBranch({ projectId: project.id, ticketId: issue.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.existed ? 'Branch already exists on GitHub' : 'Branch created', {
        description: result.branch,
        action: { label: 'Open', onClick: () => window.open(result.url, '_blank', 'noopener') },
      });
    });
  };

  const onCopy = useEffectEvent(copy);
  const onCreate = useEffectEvent(create);

  useEffect(() => {
    // Shift hotkeys also match the physical key, so ⌘⇧. works where Shift turns "." into ">".
    const unregisterKeys = registerHotkeys([
      { key: '.', mod: true, shift: true, scope: 'Issue', description: 'Copy git branch name', handler: () => onCopy() },
    ]);
    const unregisterCommands = registerPaletteCommands([
      { id: 'github.copy-branch', label: 'Copy git branch name', section: 'Issue', keywords: ['git', 'branch'], run: () => onCopy() },
      { id: 'github.create-branch', label: 'Create branch on GitHub', section: 'Issue', keywords: ['git', 'branch', 'github'], run: () => onCreate() },
    ]);
    return () => {
      unregisterKeys();
      unregisterCommands();
    };
  }, [issue.id]);

  const createItem = (
    <DropdownMenuItem
      disabled={!!createDisabledReason || creating}
      onSelect={(event) => {
        event.preventDefault(); // keep the menu's spinner visible until done
        create();
      }}
    >
      {creating ? <Loader2 className="animate-spin" /> : <GitBranchPlus />}
      Create branch on GitHub
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Git branch">
          <GitBranch />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-1.5 font-mono text-xs font-normal text-muted-foreground">
          <GithubMark className="size-3.5 shrink-0" />
          <span className="truncate" title={branch}>
            {branch}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={copy}>
          <Copy />
          Copy git branch name
          <DropdownMenuShortcut>{isMac() ? '⌘⇧.' : 'Ctrl+Shift+.'}</DropdownMenuShortcut>
        </DropdownMenuItem>
        {createDisabledReason ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Disabled items ignore the pointer; the wrapper carries the tooltip. */}
                <div>{createItem}</div>
              </TooltipTrigger>
              <TooltipContent side="left">{createDisabledReason}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          createItem
        )}
        {issue.githubBranch && repo && (
          <DropdownMenuItem asChild>
            <a
              href={`https://github.com/${repo}/tree/${issue.githubBranch.split('/').map(encodeURIComponent).join('/')}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink />
              Open branch on GitHub
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
