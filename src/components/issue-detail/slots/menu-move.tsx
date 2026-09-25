'use client';

// Owner: D4a. "Move to project" submenu in the issue … menu. Targets load when
// the submenu first opens; picking one moves the issue (and its sub-issues) and
// navigates to its new permalink. The menu unmounts on select; the move and the
// navigation carry on.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { listMoveTargets, moveIssueToProject, type MoveTarget } from '@/app/actions/move';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { useProjectPermission } from '@/components/project/project-data';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { issuePath } from '@/lib/issue-links';
import type { IssueRow } from '@/lib/issue-model';

type Targets = MoveTarget[] | 'loading' | { error: string } | null;

async function move(issue: IssueRow, target: MoveTarget, navigate: (href: string) => void) {
  const pending = toast.loading(`Moving ${issue.key} to ${target.name}…`);
  const result = await moveIssueToProject({
    projectId: issue.projectId,
    id: issue.id,
    toProjectId: target.id,
  });
  if (!result.ok) {
    toast.error(result.error === 'Forbidden' ? "You don't have permission to do that." : result.error, {
      id: pending,
    });
    return;
  }
  const extra = [
    result.moved > 1 && `with ${result.moved - 1} sub-issue${result.moved === 2 ? '' : 's'}`,
    result.droppedLabels.length > 0 && `dropped labels: ${result.droppedLabels.join(', ')}`,
  ].filter(Boolean);
  toast.success(`Moved ${result.fromKey} → ${result.key}`, {
    id: pending,
    description: extra.length ? extra.join(' · ') : undefined,
  });
  navigate(issuePath(result.projectId, result.key));
}

export function MenuMove({ issue }: { issue: IssueRow; mutations: IssueMutations }) {
  const canWrite = useProjectPermission('write');
  const router = useRouter();
  const [targets, setTargets] = useState<Targets>(null);

  if (!canWrite || issue.deletedAt) return null;

  const load = async () => {
    // Load once; retry after an error.
    if (targets === 'loading' || Array.isArray(targets)) return;
    setTargets('loading');
    const result = await listMoveTargets(issue.projectId);
    setTargets(result.ok ? result.projects : { error: result.error });
  };

  return (
    <DropdownMenuSub onOpenChange={(open) => open && void load()}>
      <DropdownMenuSubTrigger>
        <ArrowRightLeft />
        Move to project
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
        {targets === null || targets === 'loading' ? (
          <DropdownMenuItem disabled>
            <Loader2 className="animate-spin" />
            Loading projects…
          </DropdownMenuItem>
        ) : !Array.isArray(targets) ? (
          <DropdownMenuItem disabled>Couldn’t load projects.</DropdownMenuItem>
        ) : targets.length === 0 ? (
          <DropdownMenuItem disabled>No other projects you can write to.</DropdownMenuItem>
        ) : (
          targets.map((target) => (
            <DropdownMenuItem
              key={target.id}
              onSelect={() => void move(issue, target, (href) => router.push(href))}
            >
              <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                {target.ticketKey}
              </span>
              <span className="truncate">{target.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
