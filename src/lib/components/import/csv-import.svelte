<!--
  CSV → issues wizard: pick a file (parsed in the browser), map columns
  (auto-detected), preview, import. The Jira preset is the same flow fed by
  Jira's "Export → CSV (all fields)" file.
-->
<script module lang="ts">
  interface ParsedFile {
    name: string;
    headers: string[];
    rows: string[][];
  }

  const MAX_BYTES = 10 * 1024 * 1024;
</script>

<script lang="ts">
  import { m } from '@/lib/i18n';
  import FileUpIcon from '@lucide/svelte/icons/file-up';
  import XIcon from '@lucide/svelte/icons/x';
  import { toast } from 'svelte-sonner';

  import { Button } from '@/lib/components/ui/button';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/lib/components/ui/select';
  import { parseCsv } from '@/lib/import/csv';
  import {
    buildRecords,
    detectMapping,
    importFields,
    type CsvPreset,
    type ImportField,
  } from '@/lib/import/mapping';
  import { IMPORT_MAX_ROWS } from '@/lib/import/records';
  import { cn } from '@/lib/utils';
  import ImportProgress from './import-progress.svelte';
  import ImportResult from './import-result.svelte';
  import { useImportRunner } from './import-runner.svelte';
  import RecordPreview from './record-preview.svelte';

  let { projectId, preset }: { projectId: string; preset: CsvPreset } = $props();

  let file = $state.raw<ParsedFile | null>(null);
  let mapping = $state<ImportField[]>([]);
  let dragging = $state(false);
  let inputEl = $state<HTMLInputElement>();
  const inputId = $props.id();
  const runner = useImportRunner(() => projectId);

  const built = $derived(file ? buildRecords(file.rows, mapping, preset) : null);
  const hasTitle = $derived(mapping.includes('title'));

  async function load(picked: File | undefined) {
    if (!picked) return;
    if (picked.size > MAX_BYTES) {
      toast.error(m.auth_import_csv_too_big());
      return;
    }
    const rows = parseCsv(await picked.text());
    const [headers, ...data] = rows;
    if (!headers || data.length === 0) {
      toast.error(m.auth_import_csv_no_rows());
      return;
    }
    if (data.length > IMPORT_MAX_ROWS) {
      toast.error(m.auth_import_csv_max_rows({ max: IMPORT_MAX_ROWS }));
      return;
    }
    const trimmed = headers.map((h) => h.trim());
    file = { name: picked.name, headers: trimmed, rows: data };
    mapping = detectMapping(trimmed);
    runner.reset();
  }

  function clear() {
    file = null;
    mapping = [];
    runner.reset();
    if (inputEl) inputEl.value = '';
  }

  const fields = $derived(importFields());
  const fieldItems = $derived(fields.map((f) => ({ value: f.value, label: f.label })));
</script>

{#if runner.progress}
  <ImportProgress done={runner.progress.done} total={runner.progress.total} />
{:else if runner.summary}
  <ImportResult {projectId} summary={runner.summary} onReset={clear} />
{:else if !file}
  <label
    for={inputId}
    ondragover={(e) => {
      e.preventDefault();
      dragging = true;
    }}
    ondragleave={() => (dragging = false)}
    ondrop={(e) => {
      e.preventDefault();
      dragging = false;
      void load(e.dataTransfer?.files[0]);
    }}
    class={cn(
      'flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-10 text-center transition-colors hover:bg-muted/40 focus-within:ring-3 focus-within:ring-ring/50',
      dragging && 'border-primary bg-primary/5',
    )}
  >
    <FileUpIcon class="size-5 text-muted-foreground" aria-hidden="true" />
    <span class="font-medium">
      {preset === 'jira' ? m.auth_import_drop_jira() : m.auth_import_drop_csv()}
    </span>
    <span class="text-xs text-muted-foreground">
      {preset === 'jira'
        ? m.auth_import_hint_jira()
        : m.auth_import_hint_csv()}
    </span>
    <input
      bind:this={inputEl}
      id={inputId}
      type="file"
      accept=".csv,text/csv"
      class="sr-only"
      onchange={(e) => void load(e.currentTarget.files?.[0])}
    />
  </label>
{:else}
  <div class="flex flex-col gap-6">
    <div class="flex items-center gap-2 text-sm">
      <span class="font-medium">{file.name}</span>
      <span class="text-muted-foreground">
        {m.auth_import_rows_columns({
          rows: m.auth_import_rows({ count: file.rows.length }),
          columns: file.headers.length,
        })}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        class="ml-auto"
        onclick={clear}
        aria-label={m.auth_import_choose_another()}
      >
        <XIcon />
      </Button>
    </div>

    <section class="flex flex-col gap-2">
      <h3 class="text-sm font-medium">{m.auth_import_map_columns()}</h3>
      <div class="divide-y divide-border rounded-md border border-border">
        {#each file.headers as header, i (i)}
          <div class="flex items-center gap-3 px-3 py-1.5">
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm">{header || m.auth_import_column_n({ n: i + 1 })}</div>
              <div class="truncate text-xs text-muted-foreground">
                {file.rows.find((r) => r[i]?.trim())?.[i]?.slice(0, 80) ?? m.auth_import_column_empty()}
              </div>
            </div>
            <Select
              bind:value={
                () => mapping[i],
                (value) => (mapping = mapping.map((f, j) => (j === i ? (value as ImportField) : f)))
              }
              items={fieldItems}
            >
              <SelectTrigger
                size="sm"
                class="w-52"
                aria-label={m.auth_import_field_for({
                  column: header || m.auth_import_column_lower_n({ n: i + 1 }),
                })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {#each fields as f (f.value)}
                  <SelectItem value={f.value}>
                    {f.label}
                  </SelectItem>
                {/each}
              </SelectContent>
            </Select>
          </div>
        {/each}
      </div>
      <p class="text-xs text-muted-foreground">{m.auth_import_csv_note()}</p>
    </section>

    {#if hasTitle && built}
      <section class="flex flex-col gap-2">
        <h3 class="text-sm font-medium">
          {m.auth_import_preview()}{' '}
          <span class="font-normal text-muted-foreground">
            {m.auth_import_issue_count({ count: built.records.length })}
            {built.untitled > 0 ? ` · ${m.auth_import_untitled_skipped({ count: built.untitled })}` : ''}
          </span>
        </h3>
        <RecordPreview records={built.records} />
      </section>
    {:else}
      <p class="text-sm text-muted-foreground">{m.auth_import_map_title()}</p>
    {/if}

    <div class="flex gap-2">
      <Button
        disabled={!hasTitle || !built?.records.length}
        onclick={() => built && void runner.run(built.records)}
      >
        {m.auth_import_button({ count: built?.records.length ?? 0 })}
      </Button>
      <Button variant="ghost" onclick={clear}>{m.common_cancel()}</Button>
    </div>
  </div>
{/if}
