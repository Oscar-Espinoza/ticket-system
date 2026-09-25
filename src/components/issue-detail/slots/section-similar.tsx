'use client';

// Slot — owned by D9. "Similar issues": trigram + full-text neighbours of this
// issue (already-related ones excluded server-side), each with "Mark as
// duplicate of…" (B4's relation action, which also moves this issue to the
// Duplicate state) and a per-viewer dismiss kept in localStorage.

import { useEffect, useState, useTransition } from 'react';
import { CopyIcon } from 'lucide-react';
import { toast } from 'sonner';

import { addIssueRelation } from '@/app/actions/relations';
import { getSimilarIssues } from '@/app/actions/similarity';
import { IssueRefRow, SectionHeader } from '@/components/issue-hierarchy/issue-ref-row';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import type { IssueRow } from '@/lib/issue-model';
import type { SimilarIssue } from '@/lib/similarity';

const dismissKey = (issueId: string) => `similar-dismissed:${issueId}`;

function readDismissed(issueId: string): string[] {
  try {
    const raw = window.localStorage.getItem(dismissKey(issueId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(issueId: string, ids: string[]) {
  try {
    window.localStorage.setItem(dismissKey(issueId), JSON.stringify(ids.slice(-50)));
  } catch {
    // Private mode / quota: the dismissal lasts until reload.
  }
}

export function SectionSimilar({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  const canWrite = useProjectPermission('write');
  // Tagged with the issue it belongs to, so switching issues never shows stale rows.
  const [loaded, setLoaded] = useState<{ issueId: string; similar: SimilarIssue[] } | null>(null);
  const [dismissed, setDismissed] = useState<{ issueId: string; ids: string[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const { projectId, id: issueId, title } = issue;

  useEffect(() => {
    let cancelled = false;
    getSimilarIssues({ projectId, ticketId: issueId })
      .then((result) => {
        if (!cancelled) setLoaded({ issueId, similar: result.ok ? result.similar : [] });
      })
      .catch(() => {
        // Advisory section: on failure it simply stays hidden.
      });
    return () => {
      cancelled = true;
    };
    // Title edits change what "similar" means.
  }, [projectId, issueId, title]);

  if (!loaded || loaded.issueId !== issueId) return null;
  const hidden = new Set(
    dismissed?.issueId === issueId ? dismissed.ids : readDismissed(issueId),
  );
  const list = loaded.similar.filter((s) => !hidden.has(s.issue.id));
  if (list.length === 0) return null;

  const dismiss = (other: IssueRow) => {
    const ids = [...hidden, other.id];
    writeDismissed(issueId, ids);
    setDismissed({ issueId, ids });
  };

  const markDuplicate = (other: IssueRow) => {
    startTransition(async () => {
      try {
        const result = await addIssueRelation({
          projectId,
          ticketId: issueId,
          relatedTicketId: other.id,
          kind: 'duplicate_of',
        });
        if (!result.ok) {
          toast.error(
            result.error === 'Forbidden' ? "You don't have permission to do that in this project." : result.error,
          );
          return;
        }
        if (result.warning) toast.warning(result.warning);
        else toast.success(`Marked ${issue.key} as a duplicate of ${other.key}`);
        // It's related now, so it no longer belongs in this list.
        setLoaded((current) =>
          current && current.issueId === issueId
            ? { issueId, similar: current.similar.filter((s) => s.issue.id !== other.id) }
            : current,
        );
      } catch {
        toast.error('Something went wrong — nothing was changed.');
      }
    });
  };

  // The list's copy is fresher (optimistic state changes).
  const fresh = (other: IssueRow) => mutations.issues.find((i) => i.id === other.id) ?? other;

  return (
    <section aria-label="Similar issues" className="flex flex-col gap-1">
      <SectionHeader
        title="Similar issues"
        meta={<span className="text-xs text-muted-foreground">{list.length}</span>}
      />
      {list.map(({ issue: other, reason, score }) => (
        <div key={other.id} title={`${reason} · ${Math.round(score * 100)}% match`}>
          <IssueRefRow
            issue={fresh(other)}
            removeLabel="Dismiss"
            onRemove={() => dismiss(other)}
            trailing={
              canWrite ? (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={pending}
                  onClick={() => markDuplicate(other)}
                  aria-label={`Mark ${issue.key} as a duplicate of ${other.key}`}
                  className="gap-1 text-xs font-normal text-muted-foreground opacity-0 group-hover/ref:opacity-100 focus-visible:opacity-100"
                >
                  <CopyIcon className="size-3" />
                  Mark as duplicate
                </Button>
              ) : null
            }
          />
        </div>
      ))}
    </section>
  );
}
