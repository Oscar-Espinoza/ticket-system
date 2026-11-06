<!--
  A row of label chips: at most `max`, then "+N" (title lists the rest).
-->
<script lang="ts">
  import { LabelChip } from '@/lib/components/ui-icons';
  import type { IssueLabel } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';

  let {
    labels,
    max = 3,
    class: className,
  }: {
    labels: IssueLabel[];
    /** Show at most this many chips, then "+N". */
    max?: number;
    class?: string;
  } = $props();

  const shown = $derived(labels.slice(0, max));
  const rest = $derived(labels.length - shown.length);
</script>

{#if labels.length > 0}
  <span class={cn('flex min-w-0 items-center gap-1', className)}>
    {#each shown as label (label.id)}
      <LabelChip dotColor={label.color} class="max-w-32 truncate">
        <span class="truncate">{label.name}</span>
      </LabelChip>
    {/each}
    {#if rest > 0}
      <LabelChip dot={false} title={labels.slice(max).map((l) => l.name).join(', ')}>
        +{rest}
      </LabelChip>
    {/if}
  </span>
{/if}
