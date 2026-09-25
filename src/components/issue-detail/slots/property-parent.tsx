'use client';

// Owner: B4. "Parent" property row: set / change / clear the parent issue and
// jump to it. The server rejects self / descendant parents; the client just
// keeps those out of the picker, and any server error toasts via mutations.

import { useMemo, type ReactNode } from 'react';
import { ChevronsUpDown, GitFork } from 'lucide-react';

import { IssueSearchPicker } from '@/components/issue-hierarchy/issue-search-picker';
import { useOpenIssue } from '@/components/issue-hierarchy/open-issue';
import { descendantIds } from '@/components/issue-hierarchy/tree';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { StateIcon } from '@/components/ui-icons';
import type { IssueRow } from '@/lib/issue-model';
import { PropertyRow } from '../property-row';

export function PropertyParent({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  const canWrite = useProjectPermission('write');
  const open = useOpenIssue();
  const parent = issue.parentId
    ? (mutations.issues.find((i) => i.id === issue.parentId) ?? null)
    : null;
  const exclude = useMemo(() => {
    const ids = descendantIds(mutations.issues, issue.id);
    ids.add(issue.id);
    return ids;
  }, [mutations.issues, issue.id]);

  const setParent = (parentId: string | null) => mutations.update(issue, { parentId });

  const picker = (trigger: ReactNode) =>
    canWrite ? (
      <IssueSearchPicker
        issues={mutations.issues}
        exclude={exclude}
        value={issue.parentId}
        placeholder="Set parent issue…"
        onSelect={(next) => setParent(next.id)}
        onClear={issue.parentId ? () => setParent(null) : undefined}
        clearLabel="Remove parent"
      >
        {trigger}
      </IssueSearchPicker>
    ) : (
      trigger
    );

  if (!issue.parentId) {
    return (
      <PropertyRow label="Parent">
        {picker(
          <Button
            variant="ghost"
            size="sm"
            disabled={!canWrite}
            className="-ml-2 max-w-full gap-2 font-normal"
          >
            <GitFork className="text-muted-foreground" />
            <span className="text-muted-foreground">Set parent</span>
          </Button>,
        )}
      </PropertyRow>
    );
  }

  return (
    <PropertyRow label="Parent">
      <div className="-ml-2 flex min-w-0 items-center">
        {parent ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 flex-1 justify-start gap-2 font-normal"
            title={`Open ${parent.key}`}
            onClick={() => open(parent)}
          >
            <StateIcon state={parent.state} size={14} />
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{parent.key}</span>
            <span className="truncate">{parent.title}</span>
          </Button>
        ) : (
          // Archived parents aren't in the active list; still changeable/clearable.
          <span className="min-w-0 flex-1 truncate px-2 text-sm text-muted-foreground">
            Archived issue
          </span>
        )}
        {canWrite &&
          picker(
            <Button variant="ghost" size="icon-xs" aria-label="Change parent issue">
              <ChevronsUpDown />
            </Button>,
          )}
      </div>
    </PropertyRow>
  );
}
