<!--
  Month calendar by due date: drag a chip to another day to reschedule, drag
  from / to the "No due date" sidebar to set / clear it.
  Client only (registry `ssr: false`): "today" and
  the visible month depend on the viewer's timezone — the registry should
  render it only in the browser.
-->
<script lang="ts">
  import { onDestroy, type ComponentProps } from 'svelte';
  import { DragDropProvider, DragOverlay, PointerSensor } from '@dnd-kit/svelte';
  import { DragDropManager } from '@dnd-kit/dom';
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

  import { Button } from '@/lib/components/ui/button';
  import { addDays, toDateString } from '@/lib/dates';
  import type { IssueRow } from '@/lib/issue-model';
  import { dateOfDropId } from './calendar-ids';
  import CalendarDayCell from './calendar-day-cell.svelte';
  import CalendarIssueChip from './calendar-issue-chip.svelte';
  import CalendarNoDateSidebar from './calendar-no-date-sidebar.svelte';
  import type { IssueViewProps } from '@/lib/components/issues/views';

  let { issues, mutations, onSelect }: IssueViewProps = $props();

  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const monthFormat = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });

  function monthStart(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  /** Monday-first weeks covering the month (5 or 6 rows). */
  function monthDays(month: Date): Date[] {
    const first = monthStart(month);
    const start = addDays(first, -((first.getDay() + 6) % 7));
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((((first.getDay() + 6) % 7) + daysInMonth) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  }

  // Only the pointer sensor. dnd-kit#2112: build the manager
  // ourselves so items registered before the provider's effect use these
  // sensors, and still pass `sensors` (undefined would reset to the defaults).
  const sensors = [PointerSensor];
  const manager = new DragDropManager({ sensors });
  onDestroy(() => manager.destroy());

  let month = $state(monthStart(new Date()));
  // "Today" is re-derived whenever the view updates.
  const today = $derived.by(() => {
    void issues;
    void month;
    return toDateString(new Date());
  });
  const days = $derived(monthDays(month));
  const weeks = $derived(Array.from({ length: days.length / 7 }, (_, week) => days.slice(week * 7, week * 7 + 7)));

  const grouped = $derived.by(() => {
    const byDate = new Map<string, IssueRow[]>();
    const undated: IssueRow[] = [];
    for (const issue of issues) {
      if (!issue.dueDate) {
        undated.push(issue);
        continue;
      }
      const list = byDate.get(issue.dueDate);
      if (list) list.push(issue);
      else byDate.set(issue.dueDate, [issue]);
    }
    return { byDate, undated };
  });

  const shift = (months: number) => {
    month = new Date(month.getFullYear(), month.getMonth() + months, 1);
  };

  const onDragEnd: NonNullable<ComponentProps<typeof DragDropProvider>['onDragEnd']> = (event) => {
    if (event.canceled) return;
    const { source, target } = event.operation;
    const issue = issues.find((i) => i.id === source?.id);
    const targetId = target ? String(target.id) : null;
    if (!issue || !targetId) return;
    const dueDate = dateOfDropId(targetId);
    mutations.update(issue, { dueDate });
  };
</script>

<DragDropProvider {manager} {sensors} {onDragEnd}>
  <div class="flex min-h-0 flex-1 gap-3">
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="mb-2 flex items-center gap-2">
        <h2 class="text-sm font-medium" aria-live="polite">
          {monthFormat.format(month)}
        </h2>
        <div class="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" onclick={() => (month = monthStart(new Date()))}>Today</Button>
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" onclick={() => shift(-1)}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" onclick={() => shift(1)}>
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
      <div
        role="grid"
        aria-label={monthFormat.format(month)}
        class="overflow-x-auto rounded-md border-t border-l border-border"
      >
        <div role="row" class="grid min-w-[42rem] grid-cols-7">
          {#each WEEKDAYS as day (day)}
            <div
              role="columnheader"
              class="border-r border-b border-border px-2 py-1 text-xs font-medium text-muted-foreground"
            >
              {day}
            </div>
          {/each}
        </div>
        {#each weeks as week, index (index)}
          <div role="row" class="grid min-w-[42rem] grid-cols-7">
            {#each week as day (toDateString(day))}
              {@const date = toDateString(day)}
              <CalendarDayCell
                {date}
                inMonth={day.getMonth() === month.getMonth()}
                today={date === today}
                issues={grouped.byDate.get(date) ?? []}
                {onSelect}
              />
            {/each}
          </div>
        {/each}
      </div>
    </div>
    <CalendarNoDateSidebar issues={grouped.undated} {onSelect} />
  </div>
  <DragOverlay dropAnimation={null}>
    {#snippet children(source)}
      {@const issue = issues.find((i) => i.id === source.id)}
      {#if issue}
        <div class="w-56">
          <CalendarIssueChip {issue} overlay />
        </div>
      {/if}
    {/snippet}
  </DragOverlay>
</DragDropProvider>
