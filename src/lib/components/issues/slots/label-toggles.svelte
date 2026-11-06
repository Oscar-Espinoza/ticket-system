<!-- Bulk label toggles: check = every selected issue has it, minus = some do. -->
<script lang="ts">
  import MinusIcon from '@lucide/svelte/icons/minus';

  import { keywordFilter } from '@/lib/components/issue-pickers';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';
  import type { IssueRow } from '@/lib/issue-model';
  import { labelCoverage, toggleLabel } from '../bulk-actions';
  import type { IssueMutations } from '../use-issue-mutations.svelte';

  let { issues, mutations }: { issues: IssueRow[]; mutations: IssueMutations } = $props();

  const data = useProjectData();
</script>

<Command filter={keywordFilter}>
  <CommandInput placeholder="Add or remove labels…" />
  <CommandList>
    <CommandEmpty>No labels found.</CommandEmpty>
    <CommandGroup>
      {#each data.labels as label (label.id)}
        {@const coverage = labelCoverage(issues, label.id)}
        <CommandItem
          value={label.id}
          keywords={[label.name]}
          data-checked={coverage === 'all'}
          onSelect={() => toggleLabel(mutations, issues, label.id)}
        >
          <span aria-hidden="true" class="size-2 shrink-0 rounded-full" style:background-color={label.color}></span>
          <span class="truncate">{label.name}</span>
          {#if coverage === 'some'}
            <!-- Takes the check's slot (the item hides its check next to a shortcut slot). -->
            <span data-slot="command-shortcut" class="ml-auto text-muted-foreground">
              <MinusIcon aria-hidden="true" />
            </span>
          {/if}
        </CommandItem>
      {/each}
    </CommandGroup>
  </CommandList>
</Command>
