<script module lang="ts">
  export interface EpicOption {
    id: string;
    name: string;
    color: string | null;
  }
</script>

<script lang="ts">
  import BanIcon from '@lucide/svelte/icons/ban';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';

  import { PickerPopover, keywordFilter, type PickerPopoverProps } from '@/lib/components/issue-pickers';
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';
  import type { ProjectRef } from '@/lib/components/epics/epic-model';
  import EpicIcon from './epic-icon.svelte';

  let {
    value,
    epics,
    otherProjects = [],
    loadingOthers = false,
    onChange,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & {
    value: string | null;
    epics: EpicOption[];
    /** Cross-project epics (same workspace), one group per project. */
    otherProjects?: { project: ProjectRef; epics: EpicOption[] }[];
    loadingOthers?: boolean;
    onChange: (epicId: string | null) => void;
  } = $props();
</script>

<PickerPopover {...popover} bind:open class="w-64">
  {#snippet content(close: () => void)}
    {@const pick = (id: string | null) => {
      close();
      onChange(id);
    }}
    <Command filter={keywordFilter}>
      <CommandInput placeholder="Set epic…" />
      <CommandList>
        <CommandEmpty>No epic found.</CommandEmpty>
        <CommandItem
          value="__none"
          keywords={['No epic', 'Remove']}
          data-checked={value === null}
          onSelect={() => pick(null)}
        >
          <BanIcon class="text-muted-foreground" />
          No epic
        </CommandItem>
        {#each epics as epic (epic.id)}
          <CommandItem
            value={epic.id}
            keywords={[epic.name]}
            data-checked={epic.id === value}
            onSelect={() => pick(epic.id)}
          >
            <EpicIcon color={epic.color} />
            <span class="truncate">{epic.name}</span>
          </CommandItem>
        {/each}
        {#each otherProjects as { project, epics: projectEpics } (project.id)}
          <CommandGroup heading={`Epics in ${project.name}`}>
            {#each projectEpics as epic (epic.id)}
              <CommandItem
                value={epic.id}
                keywords={[epic.name, project.name, project.ticketKey]}
                data-checked={epic.id === value}
                onSelect={() => pick(epic.id)}
              >
                <EpicIcon color={epic.color} />
                <span class="flex-1 truncate">{epic.name}</span>
                <span class="font-mono text-[10px] text-muted-foreground">
                  {project.ticketKey}
                </span>
              </CommandItem>
            {/each}
          </CommandGroup>
        {/each}
        {#if loadingOthers}
          <div class="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
            <LoaderCircleIcon class="size-3.5 animate-spin" />
            Loading other projects…
          </div>
        {/if}
      </CommandList>
    </Command>
  {/snippet}
</PickerPopover>
