<!-- Start date chip. -->
<script lang="ts">
  import CalendarArrowUpIcon from '@lucide/svelte/icons/calendar-arrow-up';

  import { formatDueDate } from '@/lib/dates';
  import { cn } from '@/lib/utils';
  import { CHIP_CLASS } from './chip-class';

  let { startDate, class: className }: { startDate: string | null; class?: string } = $props();
</script>

{#if startDate}
  <span title={`Starts ${formatDueDate(startDate)}`} class={cn(CHIP_CLASS, className)}>
    <CalendarArrowUpIcon class="size-3 shrink-0" aria-hidden="true" />
    {formatDueDate(startDate)}
  </span>
{/if}
