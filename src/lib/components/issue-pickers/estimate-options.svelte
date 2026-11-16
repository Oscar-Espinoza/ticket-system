<!-- Renders nothing when the project's estimate scale is "none". -->
<script module lang="ts">
  import { m } from '@/lib/i18n';
  export interface EstimateOptionsProps {
    /** null = no estimate; undefined = mixed (bulk edit). */
    value: number | null | undefined;
    onSelect: (estimate: number | null) => void;
  }

  const NO_ESTIMATE = '__none';
</script>

<script lang="ts">
  import TriangleIcon from '@lucide/svelte/icons/triangle';

  import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/lib/components/ui/command';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { estimateOptions } from '@/lib/estimates';
  import { keywordFilter } from './picker-utils';

  let { value, onSelect }: EstimateOptionsProps = $props();

  const data = useProjectData();
  const options = $derived(estimateOptions(data.project.estimateScale));
</script>

{#if options.length > 0}
  <Command filter={keywordFilter}>
    <CommandInput placeholder={m.issues_estimate_set_placeholder()} />
    <CommandList>
      <CommandEmpty>{m.issues_estimate_none_found()}</CommandEmpty>
      <CommandItem
        value={NO_ESTIMATE}
        keywords={[m.issues_estimate_none(), m.common_none()]}
        data-checked={value === null}
        onSelect={() => onSelect(null)}
      >
        <TriangleIcon class="text-muted-foreground" />
        {m.issues_estimate_none()}
      </CommandItem>
      {#each options as option (option.value)}
        <CommandItem
          value={String(option.value)}
          keywords={[option.label, m.issues_estimate_points({ label: option.label })]}
          data-checked={option.value === value}
          onSelect={() => onSelect(option.value)}
        >
          <TriangleIcon />
          {option.label}{option.label !== String(option.value) ? '' : ` point${option.value === 1 ? '' : 's'}`}
        </CommandItem>
      {/each}
    </CommandList>
  </Command>
{/if}
