<script lang="ts">
  import { digitShortcut, keywordFilter } from '@/lib/components/issue-pickers';
  import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
    CommandShortcut,
  } from '@/lib/components/ui/command';
  import {
    EPIC_STATUSES,
    EPIC_STATUS_LABEL,
    type EpicStatus,
  } from '@/components/epics/epic-model';
  import EpicStatusIcon from './epic-status-icon.svelte';

  let {
    value,
    onSelect,
  }: {
    value: EpicStatus;
    onSelect: (status: EpicStatus) => void;
  } = $props();

  let search = $state('');
</script>

<Command
  filter={keywordFilter}
  onkeydown={digitShortcut(search, (digit) => {
    const status = EPIC_STATUSES[digit - 1];
    if (status) onSelect(status);
    return Boolean(status);
  })}
>
  <CommandInput bind:value={search} placeholder="Change status…" />
  <CommandList>
    <CommandEmpty>No status found.</CommandEmpty>
    {#each EPIC_STATUSES as status, index (status)}
      <CommandItem
        value={status}
        keywords={[EPIC_STATUS_LABEL[status]]}
        data-checked={status === value}
        onSelect={() => onSelect(status)}
      >
        <EpicStatusIcon {status} />
        {EPIC_STATUS_LABEL[status]}
        <CommandShortcut>{index + 1}</CommandShortcut>
      </CommandItem>
    {/each}
  </CommandList>
</Command>
