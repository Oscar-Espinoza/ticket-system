'use client';

// "Possible duplicates" hint under the new-issue title: up to three similar
// issues, each opening in a new tab so the draft stays put.

import { ExternalLink } from 'lucide-react';

import { StateIcon } from '@/components/ui-icons';
import { issuePath } from '@/lib/issue-links';
import { cn } from '@/lib/utils';
import { usePossibleDuplicates } from './use-possible-duplicates';

export function PossibleDuplicates({
  projectId,
  title,
  enabled,
  className,
}: {
  projectId: string;
  title: string;
  /** False while the dialog is closed or the viewer can't create issues. */
  enabled: boolean;
  className?: string;
}) {
  const similar = usePossibleDuplicates(projectId, title, enabled);
  if (similar.length === 0) return null;

  return (
    <section
      aria-label="Possible duplicates"
      aria-live="polite"
      className={cn('flex flex-col gap-0.5 rounded-md border border-dashed border-border px-2 py-1.5', className)}
    >
      <h3 className="px-1 text-xs text-muted-foreground">Possible duplicates</h3>
      <ul className="flex flex-col">
        {similar.map(({ issue, reason }) => (
          <li key={issue.id}>
            <a
              href={issuePath(issue.projectId, issue.key)}
              target="_blank"
              rel="noopener noreferrer"
              title={`${reason} — opens in a new tab`}
              className="group/dup flex h-7 items-center gap-2 rounded-sm px-1 text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <StateIcon state={issue.state} size={14} />
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate',
                  (issue.state.type === 'completed' || issue.state.type === 'canceled') &&
                    'text-muted-foreground',
                )}
              >
                {issue.title}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{issue.state.name}</span>
              <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover/dup:opacity-100 group-focus-visible/dup:opacity-100" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
