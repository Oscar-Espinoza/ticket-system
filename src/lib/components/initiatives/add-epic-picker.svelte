<!-- Picker that adds an epic to an initiative. -->
<script lang="ts">
  import EpicIcon from '@/lib/components/epics/epic-icon.svelte';
  import { PickerPopover, keywordFilter, type PickerPopoverProps } from '@/lib/components/issue-pickers';
  import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';
  import type { CandidateEpic } from '@/lib/initiative-model';

  let {
    candidates,
    onPick,
    children,
  }: {
    candidates: CandidateEpic[];
    onPick: (epicId: string, projectId: string) => void;
    children: PickerPopoverProps['children'];
  } = $props();
</script>

<PickerPopover align="end" class="w-72" {children}>
  {#snippet content(close: () => void)}
    <Command filter={keywordFilter}>
      <CommandInput placeholder="Add epic…" />
      <CommandList>
        <CommandEmpty>No epic found.</CommandEmpty>
        {#each candidates as epic (epic.id)}
          <CommandItem
            value={epic.id}
            keywords={[epic.name, epic.projectKey]}
            onSelect={() => {
              close();
              onPick(epic.id, epic.projectId);
            }}
          >
            <EpicIcon color={epic.color} />
            <span class="truncate">{epic.name}</span>
            <span class="ml-auto font-mono text-[10px] text-muted-foreground">
              {epic.projectKey}{epic.initiativeId ? ' · moves' : ''}
            </span>
          </CommandItem>
        {/each}
      </CommandList>
    </Command>
  {/snippet}
</PickerPopover>
