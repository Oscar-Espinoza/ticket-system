<script lang="ts">
  import AlertTriangleIcon from '@lucide/svelte/icons/triangle-alert';
  import CheckCircle2Icon from '@lucide/svelte/icons/circle-check';

  import { projectHref } from '@/lib/components/app-shell/routes';
  import { Button } from '@/lib/components/ui/button';
  import type { ImportSummary } from './import-runner.svelte';

  let {
    projectId,
    summary,
    onReset,
  }: {
    projectId: string;
    summary: ImportSummary;
    onReset: () => void;
  } = $props();

  const ok = $derived(!summary.error && summary.failed.length === 0);
</script>

<div class="flex flex-col gap-3 rounded-md border border-border p-4" role="status">
  <div class="flex items-center gap-2 font-medium">
    {#if ok}
      <CheckCircle2Icon class="size-4 text-status-done" />
    {:else}
      <AlertTriangleIcon class="size-4 text-status-in-progress" />
    {/if}
    {summary.created} of {summary.total} imported
  </div>
  <ul class="flex flex-col gap-1 text-sm text-muted-foreground">
    {#if summary.duplicates > 0}
      <li>{summary.duplicates} skipped — already imported into this project.</li>
    {/if}
    {#if summary.failed.length > 0}<li>{summary.failed.length} failed:</li>{/if}
    {#if summary.error}<li class="text-destructive">{summary.error}</li>{/if}
  </ul>
  {#if summary.failed.length > 0}
    <ul class="max-h-40 overflow-y-auto rounded border border-border text-xs">
      {#each summary.failed.slice(0, 100) as f (f.row)}
        <li class="flex gap-3 border-b border-border px-2 py-1 last:border-0">
          <span class="w-12 shrink-0 text-muted-foreground">Row {f.row}</span>
          <span class="truncate">{f.title || '—'}</span>
          <span class="ml-auto shrink-0 text-destructive">{f.error}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="flex gap-2">
    <Button size="sm" href={projectHref(projectId)}>View issues</Button>
    <Button size="sm" variant="ghost" onclick={onReset}>Import more</Button>
  </div>
</div>
