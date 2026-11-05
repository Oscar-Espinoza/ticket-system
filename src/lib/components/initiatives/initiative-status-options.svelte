<!-- initiative-glyphs.tsx StatusOptions. -->
<script lang="ts">
  import { digitShortcut, keywordFilter } from '@/lib/components/issue-pickers';
  import {
    Command,
    CommandInput,
    CommandItem,
    CommandList,
    CommandShortcut,
  } from '@/lib/components/ui/command';
  import {
    INITIATIVE_STATUSES,
    INITIATIVE_STATUS_LABEL,
    type InitiativeStatus,
  } from '@/lib/components/initiatives/initiative-model';
  import InitiativeStatusIcon from './initiative-status-icon.svelte';

  let {
    value,
    onSelect,
  }: {
    value: InitiativeStatus;
    onSelect: (status: InitiativeStatus) => void;
  } = $props();

  let search = $state('');
</script>

<Command
  filter={keywordFilter}
  onkeydown={digitShortcut(search, (digit) => {
    const status = INITIATIVE_STATUSES[digit - 1];
    if (status) onSelect(status);
    return Boolean(status);
  })}
>
  <CommandInput bind:value={search} placeholder="Change status…" />
  <CommandList>
    {#each INITIATIVE_STATUSES as status, index (status)}
      <CommandItem
        value={status}
        keywords={[INITIATIVE_STATUS_LABEL[status]]}
        data-checked={status === value}
        onSelect={() => onSelect(status)}
      >
        <InitiativeStatusIcon {status} />
        {INITIATIVE_STATUS_LABEL[status]}
        <CommandShortcut>{index + 1}</CommandShortcut>
      </CommandItem>
    {/each}
  </CommandList>
</Command>
