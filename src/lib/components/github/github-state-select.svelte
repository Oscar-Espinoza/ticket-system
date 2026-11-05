<script module lang="ts">
  export const DEFAULT_VALUE = 'default';
</script>

<script lang="ts">
  import { StateIcon } from '@/lib/components/ui-icons';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
  } from '@/lib/components/ui/select';
  import { AUTOMATION_OFF } from '@/lib/github/automation';
  import type { WorkflowState } from '@/lib/issue-model';

  let {
    id,
    value,
    onChange,
    states,
    fallback,
    disabled,
  }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    states: WorkflowState[];
    fallback: WorkflowState | undefined;
    disabled: boolean;
  } = $props();

  const items = $derived([
    {
      value: DEFAULT_VALUE,
      label: fallback ? `${fallback.name} (default)` : 'Default (no matching state)',
    },
    { value: AUTOMATION_OFF, label: 'No action' },
    ...states.map((state) => ({ value: state.id, label: state.name })),
  ]);
  const selectedState = $derived(states.find((state) => state.id === value));
</script>

{#snippet defaultItem()}
  {#if fallback}
    <StateIcon state={fallback} size={14} />
    {fallback.name} <span class="text-muted-foreground">(default)</span>
  {:else}
    Default (no matching state)
  {/if}
{/snippet}

<Select bind:value={() => value, onChange} {items} {disabled}>
  <SelectTrigger {id} class="w-full max-w-xs">
    <SelectValue>
      {#if value === DEFAULT_VALUE}
        {@render defaultItem()}
      {:else if value === AUTOMATION_OFF}
        No action
      {:else if selectedState}
        <StateIcon state={selectedState} size={14} />
        {selectedState.name}
      {/if}
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value={DEFAULT_VALUE}>
      {@render defaultItem()}
    </SelectItem>
    <SelectItem value={AUTOMATION_OFF}>No action</SelectItem>
    <SelectSeparator />
    {#each states as state (state.id)}
      <SelectItem value={state.id}>
        <StateIcon {state} size={14} />
        {state.name}
      </SelectItem>
    {/each}
  </SelectContent>
</Select>
