// Shared tail of every importer: chunked import with progress → result summary.
// Chunks run sequentially so issue numbers follow file order.
//
// Svelte port of useImportRunner (src/components/import/import-runner.tsx):
//   const runner = useImportRunner(projectId);   // id or getter; call during init
//   runner.run(records) / runner.progress / runner.summary / runner.reset()
// `progress` and `summary` are reactive getters (read them off `runner`).
// The presentational pieces are import-progress.svelte, import-result.svelte
// and record-preview.svelte.

import { toast } from 'svelte-sonner';

import { importIssues } from '@/lib/actions/import';
import { IMPORT_CHUNK, type ImportFailure, type ImportRecord } from '@/lib/import/records';

export interface ImportSummary {
  total: number;
  created: number;
  duplicates: number;
  failed: (ImportFailure & { row: number })[];
  /** Aborted by a server/network error part-way through. */
  error: string | null;
}

export function useImportRunner(projectId: string | (() => string)) {
  let progress = $state<{ done: number; total: number } | null>(null);
  let summary = $state.raw<ImportSummary | null>(null);
  let running = false;

  async function run(records: ImportRecord[]) {
    if (running || records.length === 0) return;
    running = true;
    summary = null;
    const id = typeof projectId === 'function' ? projectId() : projectId;
    const result: ImportSummary = {
      total: records.length,
      created: 0,
      duplicates: 0,
      failed: [],
      error: null,
    };
    progress = { done: 0, total: records.length };
    try {
      for (let start = 0; start < records.length; start += IMPORT_CHUNK) {
        const chunk = records.slice(start, start + IMPORT_CHUNK);
        const res = await importIssues({ projectId: id, records: chunk });
        if (!res.ok) {
          result.error = res.error;
          break;
        }
        result.created += res.created;
        result.duplicates += res.duplicates;
        result.failed.push(...res.failed.map((f) => ({ ...f, row: start + f.index + 1 })));
        progress = { done: Math.min(start + chunk.length, records.length), total: records.length };
      }
    } catch {
      result.error =
        'The import was interrupted. Issues imported so far were kept; re-run to continue — duplicates are skipped.';
    } finally {
      running = false;
      progress = null;
      summary = result;
    }
    if (result.error) toast.error(result.error);
    else toast.success(`Imported ${result.created} issue${result.created === 1 ? '' : 's'}.`);
  }

  return {
    run,
    get progress() {
      return progress;
    },
    get summary() {
      return summary;
    },
    reset: () => {
      summary = null;
    },
  };
}

export type ImportRunner = ReturnType<typeof useImportRunner>;
