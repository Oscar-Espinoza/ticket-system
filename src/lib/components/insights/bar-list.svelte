<!--
  Horizontal bars for "open issues by …" breakdowns. Every value is printed, so
  no hover layer is needed; states keep their own colour (colour follows the
  entity), everything else uses the brand colour.
-->
<script module lang="ts">
  export type BarListKind = 'state' | 'priority' | 'assignee' | 'label';
</script>

<script lang="ts">
  import { Avatar, PriorityIcon, StatusIcon } from '@/lib/components/ui-icons';
  import { PRIORITY_LABEL } from '@/lib/issue-model';
  import type { BreakdownRow } from '@/lib/insights-model';

  const VISIBLE = 8;

  let {
    rows,
    kind,
    empty = 'No open issues.',
  }: {
    rows: BreakdownRow[];
    kind: BarListKind;
    empty?: string;
  } = $props();

  let expanded = $state(false);

  const max = $derived(Math.max(...rows.map((r) => r.count)));
  const shown = $derived(expanded ? rows : rows.slice(0, VISIBLE));
</script>

{#if rows.length === 0}
  <p class="py-6 text-center text-sm text-muted-foreground">{empty}</p>
{:else}
  <div class="flex flex-col">
    <ul class="flex flex-col gap-1.5">
      {#each shown as row (row.id)}
        {@const label = kind === 'priority' && row.priority ? PRIORITY_LABEL[row.priority] : row.label}
        <li class="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm">
          <span class="flex min-w-0 items-center gap-2">
            {#if kind === 'state' && row.stateType}
              <StatusIcon type={row.stateType} color={row.color ?? undefined} size={14} />
            {:else if kind === 'priority' && row.priority}
              <PriorityIcon priority={row.priority} size={14} />
            {:else if kind === 'assignee'}
              <Avatar name={row.label} src={row.image} size={20} />
            {:else}
              <span
                aria-hidden="true"
                class="size-2 shrink-0 rounded-full"
                style:background-color={row.color ?? undefined}
              ></span>
            {/if}
            <span class="truncate">{label}</span>
          </span>
          <span class="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span
              class={kind === 'state' ? 'block h-full rounded-full' : 'block h-full rounded-full bg-primary/80'}
              style:width="{Math.max(2, (row.count / max) * 100)}%"
              style:background-color={kind === 'state' ? (row.color ?? undefined) : undefined}
            ></span>
          </span>
          <span class="text-right tabular-nums text-muted-foreground">{row.count}</span>
        </li>
      {/each}
    </ul>
    {#if rows.length > VISIBLE}
      <button
        type="button"
        onclick={() => (expanded = !expanded)}
        class="mt-2 self-start text-xs text-muted-foreground hover:text-foreground"
      >
        {expanded ? 'Show less' : `Show ${rows.length - VISIBLE} more`}
      </button>
    {/if}
  </div>
{/if}
