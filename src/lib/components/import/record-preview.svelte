<!-- First rows as they'll be created (state/assignee resolve on the server). -->
<script lang="ts">
  import { LabelChip, PriorityIcon } from '@/lib/components/ui-icons';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '@/lib/components/ui/table';
  import { PRIORITY_LABEL } from '@/lib/issue-model';
  import type { ImportRecord } from '@/lib/import/records';

  let { records }: { records: ImportRecord[] } = $props();

  const rows = $derived(records.slice(0, 5));
</script>

<div class="overflow-x-auto rounded-md border border-border">
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
      {#each rows as r, i (i)}
        <TableRow>
          <TableCell class="max-w-64 truncate font-medium">{r.title}</TableCell>
          <TableCell class="text-muted-foreground">
            {r.state ?? (r.closed ? 'Closed → first done state' : 'Default')}
          </TableCell>
          <TableCell>
            {#if r.priority}
              <span class="inline-flex items-center gap-1.5">
                <PriorityIcon priority={r.priority} />
                {PRIORITY_LABEL[r.priority]}
              </span>
            {:else}
              <span class="text-muted-foreground">—</span>
            {/if}
          </TableCell>
          <TableCell class="max-w-40 truncate text-muted-foreground">
            {r.assignee ?? '—'}
          </TableCell>
          <TableCell>
            <div class="flex max-w-56 flex-wrap gap-1">
              {#each r.labels.slice(0, 3) as l (l.name)}
                <LabelChip dotColor={l.color ?? undefined}>{l.name}</LabelChip>
              {/each}
              {#if r.labels.length > 3}
                <span class="text-xs text-muted-foreground">+{r.labels.length - 3}</span>
              {/if}
            </div>
          </TableCell>
          <TableCell class="text-muted-foreground">{r.estimate ?? '—'}</TableCell>
          <TableCell class="text-muted-foreground">{r.dueDate ?? '—'}</TableCell>
        </TableRow>
      {/each}
    </TableBody>
  </Table>
  {#if records.length > rows.length}
    <p class="border-t border-border px-3 py-2 text-xs text-muted-foreground">
      …and {records.length - rows.length} more
    </p>
  {/if}
</div>
