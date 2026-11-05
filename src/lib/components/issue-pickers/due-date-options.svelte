<script module lang="ts">
  import { addDays, toDateString } from '@/lib/dates';

  export interface DueDateOptionsProps {
    /** YYYY-MM-DD, or null. */
    value: string | null | undefined;
    onSelect: (dueDate: string | null) => void;
  }

  function quickOptions(today = new Date()) {
    // End of week = the coming Friday (today when it's Friday).
    const friday = addDays(today, (5 - today.getDay() + 7) % 7);
    return [
      { label: 'Today', date: today },
      { label: 'Tomorrow', date: addDays(today, 1) },
      { label: 'End of this week', date: friday },
      { label: 'In one week', date: addDays(today, 7) },
      { label: 'In two weeks', date: addDays(today, 14) },
    ].map((option) => ({ ...option, value: toDateString(option.date) }));
  }
</script>

<script lang="ts">
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
  import XIcon from '@lucide/svelte/icons/x';

  import { Calendar } from '@/lib/components/ui/calendar';
  import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/lib/components/ui/command';
  import { formatDueDate, fromDateString } from '@/lib/dates';

  let { value, onSelect }: DueDateOptionsProps = $props();

  const selected = $derived(value ? fromDateString(value) : undefined);
  // Computed when the list opens (React recomputed per render; the list only
  // lives while the popover is open).
  const options = quickOptions();
</script>

<div class="flex flex-col">
  <Command>
    <CommandInput placeholder="Set due date…" />
    <CommandList>
      <CommandGroup>
        {#each options as option (option.label)}
          <CommandItem value={option.label} data-checked={option.value === value} onSelect={() => onSelect(option.value)}>
            <CalendarDaysIcon class="text-muted-foreground" />
            {option.label}
            <span class="ml-auto text-xs text-muted-foreground">
              {formatDueDate(option.value)}
            </span>
          </CommandItem>
        {/each}
        {#if value}
          <CommandItem value="Remove due date" onSelect={() => onSelect(null)}>
            <XIcon class="text-muted-foreground" />
            Remove due date
          </CommandItem>
        {/if}
      </CommandGroup>
    </CommandList>
    <CommandSeparator />
  </Command>
  <Calendar
    mode="single"
    {selected}
    defaultMonth={selected}
    onSelect={(date) => date && onSelect(toDateString(date))}
    class="mx-auto"
  />
</div>
