<script module lang="ts">
  export const DEFAULT_VALUE = 'default';
</script>

<script lang="ts">
  import { m } from '@/lib/i18n';
  import { StateIcon } from '@/lib/components/ui-icons';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
  } from '@/lib/components/ui/select';
  import { AUTOMATION_OFF } from '@/lib/vcs/automation-state';
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
      label: fallback
        ? m.settings_github_default_state({ name: fallback.name })
        : m.settings_github_default_no_match(),
    },
    { value: AUTOMATION_OFF, label: m.settings_github_no_action() },
    ...states.map((state) => ({ value: state.id, label: state.name })),
  ]);
  const selectedState = $derived(states.find((state) => state.id === value));
</script>

{#snippet defaultItem()}
  {#if fallback}
    <StateIcon state={fallback} size={14} />
    {fallback.name} <span class="text-muted-foreground">{m.settings_github_default_suffix()}</span>
  {:else}
    {m.settings_github_default_no_match()}
  {/if}
{/snippet}

<Select bind:value={() => value, onChange} {items} {disabled}>
  <SelectTrigger {id} class="w-full max-w-xs">
    <SelectValue>
      {#if value === DEFAULT_VALUE}
        {@render defaultItem()}
      {:else if value === AUTOMATION_OFF}
        {m.settings_github_no_action()}
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
    <SelectItem value={AUTOMATION_OFF}>{m.settings_github_no_action()}</SelectItem>
    <SelectSeparator />
    {#each states as state (state.id)}
      <SelectItem value={state.id}>
        <StateIcon {state} size={14} />
        {state.name}
      </SelectItem>
    {/each}
  </SelectContent>
</Select>
