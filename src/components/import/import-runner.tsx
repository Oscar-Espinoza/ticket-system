'use client';

// Shared tail of every importer: preview table → chunked import with progress →
// result summary. Chunks run sequentially so issue numbers follow file order.

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { importIssues } from '@/app/actions/import';
import { projectHref } from '@/components/app-shell/routes';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PriorityIcon, LabelChip } from '@/components/ui-icons';
import { PRIORITY_LABEL } from '@/lib/issue-model';
import {
  IMPORT_CHUNK,
  type ImportFailure,
  type ImportRecord,
} from '@/lib/import/records';

export interface ImportSummary {
  total: number;
  created: number;
  duplicates: number;
  failed: (ImportFailure & { row: number })[];
  /** Aborted by a server/network error part-way through. */
  error: string | null;
}

export function useImportRunner(projectId: string) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const running = useRef(false);

  const run = useCallback(
    async (records: ImportRecord[]) => {
      if (running.current || records.length === 0) return;
      running.current = true;
      setSummary(null);
      const result: ImportSummary = {
        total: records.length,
        created: 0,
        duplicates: 0,
        failed: [],
        error: null,
      };
      setProgress({ done: 0, total: records.length });
      try {
        for (let start = 0; start < records.length; start += IMPORT_CHUNK) {
          const chunk = records.slice(start, start + IMPORT_CHUNK);
          const res = await importIssues({ projectId, records: chunk });
          if (!res.ok) {
            result.error = res.error;
            break;
          }
          result.created += res.created;
          result.duplicates += res.duplicates;
          result.failed.push(...res.failed.map((f) => ({ ...f, row: start + f.index + 1 })));
          setProgress({ done: Math.min(start + chunk.length, records.length), total: records.length });
        }
      } catch {
        result.error = 'The import was interrupted. Issues imported so far were kept; re-run to continue — duplicates are skipped.';
      } finally {
        running.current = false;
        setProgress(null);
        setSummary(result);
      }
      if (result.error) toast.error(result.error);
      else toast.success(`Imported ${result.created} issue${result.created === 1 ? '' : 's'}.`);
    },
    [projectId],
  );

  return { run, progress, summary, reset: () => setSummary(null) };
}

export function ImportProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        Importing {done} of {total}…
      </div>
      <Progress value={(done / total) * 100} aria-label="Import progress" />
    </div>
  );
}

export function ImportResult({
  projectId,
  summary,
  onReset,
}: {
  projectId: string;
  summary: ImportSummary;
  onReset: () => void;
}) {
  const ok = !summary.error && summary.failed.length === 0;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4" role="status">
      <div className="flex items-center gap-2 font-medium">
        {ok ? (
          <CheckCircle2 className="size-4 text-status-done" />
        ) : (
          <AlertTriangle className="size-4 text-status-in-progress" />
        )}
        {summary.created} of {summary.total} imported
      </div>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {summary.duplicates > 0 && (
          <li>{summary.duplicates} skipped — already imported into this project.</li>
        )}
        {summary.failed.length > 0 && <li>{summary.failed.length} failed:</li>}
        {summary.error && <li className="text-destructive">{summary.error}</li>}
      </ul>
      {summary.failed.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded border border-border text-xs">
          {summary.failed.slice(0, 100).map((f) => (
            <li key={f.row} className="flex gap-3 border-b border-border px-2 py-1 last:border-0">
              <span className="w-12 shrink-0 text-muted-foreground">Row {f.row}</span>
              <span className="truncate">{f.title || '—'}</span>
              <span className="ml-auto shrink-0 text-destructive">{f.error}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button size="sm" asChild>
          <Link href={projectHref(projectId)}>View issues</Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset}>
          Import more
        </Button>
      </div>
    </div>
  );
}

/** First rows as they'll be created (state/assignee resolve on the server). */
export function RecordPreview({ records }: { records: ImportRecord[] }) {
  const rows = records.slice(0, 5);
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Labels</TableHead>
            <TableHead>Estimate</TableHead>
            <TableHead>Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="max-w-64 truncate font-medium">{r.title}</TableCell>
              <TableCell className="text-muted-foreground">
                {r.state ?? (r.closed ? 'Closed → first done state' : 'Default')}
              </TableCell>
              <TableCell>
                {r.priority ? (
                  <span className="inline-flex items-center gap-1.5">
                    <PriorityIcon priority={r.priority} />
                    {PRIORITY_LABEL[r.priority]}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="max-w-40 truncate text-muted-foreground">
                {r.assignee ?? '—'}
              </TableCell>
              <TableCell>
                <div className="flex max-w-56 flex-wrap gap-1">
                  {r.labels.slice(0, 3).map((l) => (
                    <LabelChip key={l.name} dotColor={l.color ?? undefined}>
                      {l.name}
                    </LabelChip>
                  ))}
                  {r.labels.length > 3 && (
                    <span className="text-xs text-muted-foreground">+{r.labels.length - 3}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{r.estimate ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{r.dueDate ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {records.length > rows.length && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          …and {records.length - rows.length} more
        </p>
      )}
    </div>
  );
}
