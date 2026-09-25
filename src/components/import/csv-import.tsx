'use client';

// CSV → issues wizard: pick a file (parsed in the browser), map columns
// (auto-detected), preview, import. The Jira preset is the same flow fed by
// Jira's "Export → CSV (all fields)" file.

import { useId, useMemo, useRef, useState } from 'react';
import { FileUp, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parseCsv } from '@/lib/import/csv';
import {
  buildRecords,
  detectMapping,
  IMPORT_FIELDS,
  type CsvPreset,
  type ImportField,
} from '@/lib/import/mapping';
import { IMPORT_MAX_ROWS } from '@/lib/import/records';
import { cn } from '@/lib/utils';
import { ImportProgress, ImportResult, RecordPreview, useImportRunner } from './import-runner';

const MAX_BYTES = 10 * 1024 * 1024;

interface ParsedFile {
  name: string;
  headers: string[];
  rows: string[][];
}

export function CsvImport({ projectId, preset }: { projectId: string; preset: CsvPreset }) {
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const runner = useImportRunner(projectId);

  const built = useMemo(
    () => (file ? buildRecords(file.rows, mapping, preset) : null),
    [file, mapping, preset],
  );
  const hasTitle = mapping.includes('title');

  async function load(picked: File | undefined) {
    if (!picked) return;
    if (picked.size > MAX_BYTES) {
      toast.error('That file is over 10 MB — split it into smaller files.');
      return;
    }
    const rows = parseCsv(await picked.text());
    const [headers, ...data] = rows;
    if (!headers || data.length === 0) {
      toast.error('No rows found. The first line should be a header row.');
      return;
    }
    if (data.length > IMPORT_MAX_ROWS) {
      toast.error(`At most ${IMPORT_MAX_ROWS} rows per import — split the file.`);
      return;
    }
    const trimmed = headers.map((h) => h.trim());
    setFile({ name: picked.name, headers: trimmed, rows: data });
    setMapping(detectMapping(trimmed));
    runner.reset();
  }

  function clear() {
    setFile(null);
    setMapping([]);
    runner.reset();
    if (inputRef.current) inputRef.current.value = '';
  }

  if (runner.progress) return <ImportProgress {...runner.progress} />;
  if (runner.summary) {
    return <ImportResult projectId={projectId} summary={runner.summary} onReset={clear} />;
  }

  if (!file) {
    return (
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void load(e.dataTransfer.files[0]);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-10 text-center transition-colors hover:bg-muted/40 focus-within:ring-3 focus-within:ring-ring/50',
          dragging && 'border-primary bg-primary/5',
        )}
      >
        <FileUp className="size-5 text-muted-foreground" aria-hidden />
        <span className="font-medium">
          {preset === 'jira' ? 'Drop your Jira CSV export' : 'Drop a CSV file'} or click to choose
        </span>
        <span className="text-xs text-muted-foreground">
          {preset === 'jira'
            ? 'In Jira: Filters → your issues → Export → Export CSV (all fields).'
            : 'First row is the header. Title is required; everything else is optional.'}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => void load(e.target.files?.[0])}
        />
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{file.name}</span>
        <span className="text-muted-foreground">
          {file.rows.length} row{file.rows.length === 1 ? '' : 's'} · {file.headers.length} columns
        </span>
        <Button variant="ghost" size="icon-xs" className="ml-auto" onClick={clear} aria-label="Choose another file">
          <X />
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Map columns</h3>
        <div className="divide-y divide-border rounded-md border border-border">
          {file.headers.map((header, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{header || `Column ${i + 1}`}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {file.rows.find((r) => r[i]?.trim())?.[i]?.slice(0, 80) ?? 'empty'}
                </div>
              </div>
              <Select
                value={mapping[i]}
                onValueChange={(value) =>
                  setMapping((prev) => prev.map((f, j) => (j === i ? (value as ImportField) : f)))
                }
              >
                <SelectTrigger size="sm" className="w-52" aria-label={`Field for ${header || `column ${i + 1}`}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMPORT_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Statuses match your workflow by name (unknown ones use the default state). Assignees
          match project members by email. Missing labels are created. Rows with a source ID
          that were imported before are skipped.
        </p>
      </section>

      {hasTitle && built ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            Preview{' '}
            <span className="font-normal text-muted-foreground">
              {built.records.length} issue{built.records.length === 1 ? '' : 's'}
              {built.untitled > 0 && ` · ${built.untitled} rows without a title will be skipped`}
            </span>
          </h3>
          <RecordPreview records={built.records} />
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Map a column to Title to continue.</p>
      )}

      <div className="flex gap-2">
        <Button
          disabled={!hasTitle || !built?.records.length}
          onClick={() => built && void runner.run(built.records)}
        >
          Import {built?.records.length ?? 0} issue{built?.records.length === 1 ? '' : 's'}
        </Button>
        <Button variant="ghost" onClick={clear}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
