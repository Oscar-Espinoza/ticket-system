'use client';

import { useOptimistic, useTransition } from 'react';
import Link from 'next/link';
import { FilePen, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { deleteDraft, discardAllDrafts } from '@/app/actions/drafts';
import { projectHref } from '@/components/app-shell/routes';
import { relativeTime } from '@/components/issues/issue-properties';
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
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui-icons';
import { DRAFT_PARAM } from './new-issue-bus';

export interface DraftListItem {
  id: string;
  title: string;
  description: string | null;
  updatedAt: Date;
  projectId: string;
  projectName: string;
  ticketKey: string;
}

type Op = { type: 'delete'; id: string } | { type: 'clear' };

export function DraftsList({ drafts }: { drafts: DraftListItem[] }) {
  const [list, apply] = useOptimistic(drafts, (current, op: Op) =>
    op.type === 'clear' ? [] : current.filter((d) => d.id !== op.id),
  );
  const [, startTransition] = useTransition();

  const remove = (id: string) =>
    startTransition(async () => {
      apply({ type: 'delete', id });
      const result = await deleteDraft({ id }).catch(() => null);
      if (!result?.ok) toast.error('Could not delete the draft.');
    });

  const clear = () =>
    startTransition(async () => {
      apply({ type: 'clear' });
      const result = await discardAllDrafts().catch(() => null);
      if (!result?.ok) toast.error('Could not discard the drafts.');
      else toast.success('Discarded all drafts');
    });

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center gap-2">
        <h1 className="text-xl font-medium">Drafts</h1>
        {list.length > 0 && (
          <span className="text-sm tabular-nums text-muted-foreground">{list.length}</span>
        )}
        {list.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground">
                Discard all
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Discard all drafts?</AlertDialogTitle>
                <AlertDialogDescription>
                  {list.length === 1 ? 'Your draft' : `All ${list.length} drafts`} will be deleted.
                  This can’t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={clear}>
                  Discard all
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<FilePen />}
          title="No drafts"
          description="Issues you start writing but don’t create are saved here automatically."
        />
      ) : (
        <ul className="flex flex-col gap-px">
          {list.map((draft) => (
            <li key={draft.id} className="group relative">
              <Link
                href={`${projectHref(draft.projectId)}?${DRAFT_PARAM}=${encodeURIComponent(draft.id)}`}
                className="flex h-11 items-center gap-3 rounded-md px-3 pr-12 text-sm outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FilePen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className={draft.title.trim() ? 'truncate' : 'truncate italic text-muted-foreground'}>
                    {draft.title.trim() || 'Untitled draft'}
                  </span>
                  {draft.description && (
                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                      {draft.description.slice(0, 160)}
                    </span>
                  )}
                </span>
                <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground md:flex">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{draft.ticketKey}</span>
                  <span className="max-w-40 truncate">{draft.projectName}</span>
                </span>
                <time
                  dateTime={new Date(draft.updatedAt).toISOString()}
                  suppressHydrationWarning
                  className="w-20 shrink-0 text-right text-xs text-muted-foreground"
                >
                  {relativeTime(draft.updatedAt)}
                </time>
              </Link>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Delete draft ${draft.title.trim() || 'Untitled draft'}`}
                onClick={() => remove(draft.id)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
