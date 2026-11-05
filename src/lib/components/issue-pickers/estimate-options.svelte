<!-- Renders nothing when the project's estimate scale is "none". -->
<script module lang="ts">
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
    <CommandInput placeholder="Set estimate…" />
    <CommandList>
      <CommandEmpty>No estimate found.</CommandEmpty>
      <CommandItem
        value={NO_ESTIMATE}
        keywords={['No estimate', 'None']}
        data-checked={value === null}
        onSelect={() => onSelect(null)}
      >
        <TriangleIcon class="text-muted-foreground" />
        No estimate
      </CommandItem>
      {#each options as option (option.value)}
        <CommandItem
          value={String(option.value)}
          keywords={[option.label, `${option.label} points`]}
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
