'use client';

// Archive and trash pages: a searchable list of archived / trashed issues with
// Restore, plus "Delete permanently" (admins) in the trash. Mutations go
// through useIssueMutations with an `include` scope, so a restored issue drops
// out of this list optimistically.

import { useOptimistic, useState, useTransition } from 'react';
import { Archive, ArchiveRestore, SearchX, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import { purgeIssue } from '@/app/actions/tickets';
import { useIssueMutations } from '@/components/issues/use-issue-mutations';
import { useProjectPermission } from '@/components/project/project-data';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui-icons';
import type { IssueRow } from '@/lib/issue-model';
import { NavList } from './list-navigation';
import { NavIssueRow } from './nav-issue-row';

type Mode = 'archive' | 'trash';

const INCLUDE: Record<Mode, (issue: IssueRow) => boolean> = {
  archive: (i) => !!i.archivedAt && !i.deletedAt,
  trash: (i) => !!i.deletedAt,
};

export function IssueBin({ mode, issues: serverIssues }: { mode: Mode; issues: IssueRow[] }) {
  const canWrite = useProjectPermission('write');
  const isAdmin = useProjectPermission('admin');
  const mutations = useIssueMutations(serverIssues, { include: INCLUDE[mode] });
  const [purged, markPurged] = useOptimistic<string[], string>([], (ids, id) => [...ids, id]);
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<IssueRow | null>(null);

  const visible = mutations.issues.filter((issue) => !purged.includes(issue.id));
  const q = query.trim().toLowerCase();
  const listed = q
    ? visible.filter(
        (issue) => issue.key.toLowerCase().includes(q) || issue.title.toLowerCase().includes(q),
      )
    : visible;

  const restore = (issue: IssueRow) =>
    mode === 'archive'
      ? mutations.unarchive(issue, () => toast.success(`Unarchived ${issue.key}`))
      : mutations.restore(issue, () => toast.success(`Restored ${issue.key}`));

  const purge = (issue: IssueRow) => {
    setConfirm(null);
    startTransition(async () => {
      markPurged(issue.id);
      try {
        const result = await purgeIssue({ projectId: issue.projectId, id: issue.id });
        if (result.ok) toast.success(`Deleted ${issue.key} permanently`);
        else toast.error(result.error === 'Forbidden' ? 'Only admins can delete issues permanently.' : result.error);
      } catch {
        toast.error('Something went wrong — the issue was not deleted.');
      }
    });
  };

  if (visible.length === 0) {
    return mode === 'archive' ? (
      <EmptyState
        icon={<Archive />}
        title="No archived issues"
        description="Archive issues you no longer need in the list. They stay searchable here and can be unarchived any time."
      />
    ) : (
      <EmptyState
        icon={<Trash2 />}
        title="Trash is empty"
        description="Deleted issues stay here for 30 days before they are removed for good."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label={mode === 'archive' ? 'Search archived issues' : 'Search deleted issues'}
          placeholder="Filter by key or title…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 max-w-xs"
        />
        <p className="text-xs text-muted-foreground">
          {visible.length} {visible.length === 1 ? 'issue' : 'issues'}
          {mode === 'trash' && ' · permanently deleted 30 days after being moved to the trash'}
        </p>
      </div>

      {listed.length === 0 ? (
        <EmptyState icon={<SearchX />} title="No matching issues" description={`Nothing matches “${query.trim()}”.`} />
      ) : (
        <NavList className="flex flex-col gap-px">
          {listed.map((issue) => (
            <NavIssueRow
              key={issue.id}
              issue={issue}
              time={
                mode === 'archive'
                  ? { date: issue.archivedAt ?? issue.updatedAt, label: 'Archived' }
                  : { date: issue.deletedAt ?? issue.updatedAt, label: 'Deleted' }
              }
              actions={
                canWrite && (
                  <>
                    <Button size="xs" variant="outline" onClick={() => restore(issue)}>
                      {mode === 'archive' ? <ArchiveRestore /> : <Undo2 />}
                      {mode === 'archive' ? 'Unarchive' : 'Restore'}
                    </Button>
                    {mode === 'trash' && isAdmin && (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirm(issue)}
                      >
                        Delete permanently
                      </Button>
                    )}
                  </>
                )
              }
            />
          ))}
        </NavList>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirm?.key} permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              “{confirm?.title}” and its comments, attachments and history are removed for good.
              This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => confirm && purge(confirm)}>
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
