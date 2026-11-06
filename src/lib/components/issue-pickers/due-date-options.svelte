<script module lang="ts">
  import { toDateString } from '@/lib/dates';
  import { dueDateQuickOptions } from './option-builders';

  export interface DueDateOptionsProps {
    /** YYYY-MM-DD, or null. */
    value: string | null | undefined;
    onSelect: (dueDate: string | null) => void;
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
  // Computed when the list opens; the list only lives while the popover is open.
  const options = dueDateQuickOptions();
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
