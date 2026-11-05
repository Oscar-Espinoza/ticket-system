<!-- Quick options + calendar for StartDatePicker (React's local StartDateOptions). -->
<script module lang="ts">
  import { addDays, toDateString } from '@/lib/dates';

  function quickOptions(today = new Date()) {
    // Next Monday (a week from today when today is Monday).
    const monday = addDays(today, ((8 - today.getDay()) % 7) || 7);
    return [
      { label: 'Today', date: today },
      { label: 'Tomorrow', date: addDays(today, 1) },
      { label: 'Next week', date: monday },
      { label: 'In two weeks', date: addDays(monday, 7) },
    ].map((option) => ({ ...option, value: toDateString(option.date) }));
  }
</script>

<script lang="ts">
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
  import XIcon from '@lucide/svelte/icons/x';

  import { Calendar } from '@/lib/components/ui/calendar';
  import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/lib/components/ui/command';
  import { formatDueDate, fromDateString } from '@/lib/dates';

  let {
    value,
    onSelect,
  }: {
    value: string | null | undefined;
    onSelect: (startDate: string | null) => void;
  } = $props();

  const selected = $derived(value ? fromDateString(value) : undefined);
  const options = quickOptions();
</script>

<div class="flex flex-col">
  <Command>
    <CommandInput placeholder="Set start date…" />
    <CommandList>
      <CommandGroup>
        {#each options as option (option.label)}
          <CommandItem value={option.label} data-checked={option.value === value} onSelect={() => onSelect(option.value)}>
            <CalendarDaysIcon class="text-muted-foreground" />
            {option.label}
            <span class="ml-auto text-xs text-muted-foreground">{formatDueDate(option.value)}</span>
          </CommandItem>
        {/each}
        {#if value}
          <CommandItem value="Remove start date" onSelect={() => onSelect(null)}>
            <XIcon class="text-muted-foreground" />
            Remove start date
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
