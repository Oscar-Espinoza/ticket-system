<script lang="ts">
  import { LabelChip } from '@/lib/components/ui-icons';
  import { cn } from '@/lib/utils';
  import type { EpicLabelRow } from '@/lib/epic-model';

  let {
    labels,
    labelIds,
    max,
    class: className,
  }: {
    labels: EpicLabelRow[];
    labelIds: string[] | undefined;
    /** Show at most this many, then "+N". */
    max?: number;
    class?: string;
  } = $props();

  const own = $derived.by(() => {
    const byId = new Map(labels.map((l) => [l.id, l]));
    return (labelIds ?? []).flatMap((id) => byId.get(id) ?? []);
  });
  const shown = $derived(max ? own.slice(0, max) : own);
  const rest = $derived(own.length - shown.length);
</script>

{#if own.length > 0}
  <span class={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
    {#each shown as label (label.id)}
      <LabelChip dotColor={label.color} class="max-w-32">
        <span class="truncate">{label.name}</span>
      </LabelChip>
    {/each}
    {#if rest > 0}
      <span
        class="text-xs text-muted-foreground"
        title={own
          .slice(shown.length)
          .map((l) => l.name)
          .join(', ')}
      >
        +{rest}
      </span>
    {/if}
  </span>
{/if}
