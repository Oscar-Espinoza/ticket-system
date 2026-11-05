<!-- Start date chip (port of StartDateChip in src/components/views/property-chips.tsx). -->
<script lang="ts">
  import CalendarArrowUpIcon from '@lucide/svelte/icons/calendar-arrow-up';

  import { formatDueDate } from '@/lib/dates';
  import { cn } from '@/lib/utils';

  const CHIP =
    'inline-flex h-5 max-w-40 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground';

  let { startDate, class: className }: { startDate: string | null; class?: string } = $props();
</script>

{#if startDate}
  <span title={`Starts ${formatDueDate(startDate)}`} class={cn(CHIP, className)}>
    <CalendarArrowUpIcon class="size-3 shrink-0" aria-hidden="true" />
    {formatDueDate(startDate)}
  </span>
{/if}
