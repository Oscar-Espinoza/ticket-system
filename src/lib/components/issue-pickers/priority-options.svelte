<script module lang="ts">
  import type { Priority } from '@/lib/issue-model';

  export interface PriorityOptionsProps {
    /** null when mixed (bulk edit). */
    value: Priority | null;
    onSelect: (priority: Priority) => void;
  }

  // Menu order and number keys match Linear: 0 none, 1 urgent … 4 low.
  const MENU_ORDER: Priority[] = ['none', 'urgent', 'high', 'medium', 'low'];
</script>

<script lang="ts">
  import { Command, CommandEmpty, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/lib/components/ui/command';
  import { PriorityIcon } from '@/lib/components/ui-icons';
  import { PRIORITY_LABEL } from '@/lib/issue-model';
  import { digitShortcut, keywordFilter } from './picker-utils';

  let { value, onSelect }: PriorityOptionsProps = $props();

  let search = $state('');
</script>

<Command
  filter={keywordFilter}
  onkeydown={digitShortcut(search, (digit) => {
    const priority = MENU_ORDER[digit];
    if (priority) onSelect(priority);
    return Boolean(priority);
  })}
>
  <CommandInput bind:value={search} placeholder="Set priority…" />
  <CommandList>
    <CommandEmpty>No priority found.</CommandEmpty>
    {#each MENU_ORDER as priority, index (priority)}
      <CommandItem
        value={priority}
        keywords={[PRIORITY_LABEL[priority]]}
        data-checked={priority === value}
        onSelect={() => onSelect(priority)}
      >
        <PriorityIcon {priority} size={14} />
        {PRIORITY_LABEL[priority]}
        <CommandShortcut>{index}</CommandShortcut>
      </CommandItem>
    {/each}
  </CommandList>
</Command>
