<!-- Bare state list (type to filter, 1–9 picks the nth state) for dialogs / palette. -->
<script module lang="ts">
  import type { WorkflowState } from '@/lib/issue-model';

  export interface StateOptionsProps {
    /** Current state id; null when mixed (bulk edit). */
    value: string | null;
    onSelect: (stateId: string, state: WorkflowState) => void;
    /** Defaults to the project's states. */
    states?: WorkflowState[];
  }
</script>

<script lang="ts">
  import { Command, CommandEmpty, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/lib/components/ui/command';
  import { StateIcon } from '@/lib/components/ui-icons';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { digitShortcut, keywordFilter } from './picker-utils';

  let { value, onSelect, states }: StateOptionsProps = $props();

  const project = useProjectData();
  const list = $derived(states ?? project.states);
  let search = $state('');
</script>

<Command
  filter={keywordFilter}
  onkeydown={digitShortcut(search, (digit) => {
    const state = list[digit - 1];
    if (state) onSelect(state.id, state);
    return Boolean(state);
  })}
>
  <CommandInput bind:value={search} placeholder="Change status…" />
  <CommandList>
    <CommandEmpty>No status found.</CommandEmpty>
    {#each list as state, index (state.id)}
      <CommandItem
        value={state.id}
        keywords={[state.name]}
        data-checked={state.id === value}
        onSelect={() => onSelect(state.id, state)}
      >
        <StateIcon {state} size={14} />
        <span class="truncate">{state.name}</span>
        {#if index < 9}<CommandShortcut>{index + 1}</CommandShortcut>{/if}
      </CommandItem>
    {/each}
  </CommandList>
</Command>
