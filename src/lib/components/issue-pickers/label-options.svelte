<!-- Multi-select: toggles stay open; "Create label" when nothing matches exactly. -->
<script module lang="ts">
  export interface LabelOptionsProps {
    /** Selected label ids. */
    value: string[];
    /** Full replacement set (maps onto IssuePatch.labelIds). */
    onChange: (labelIds: string[]) => void;
  }

  const CREATE = '__create';
</script>

<script lang="ts">
  import PlusIcon from '@lucide/svelte/icons/plus';
  import { toast } from 'svelte-sonner';

  import { createLabel } from '@/lib/actions/labels';
  import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/lib/components/ui/command';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { keywordFilter, LABEL_COLORS } from './picker-utils';

  let { value, onChange }: LabelOptionsProps = $props();

  const data = useProjectData();
  const canCreate = useProjectPermission('write');
  let search = $state('');
  let creating = $state(false);
  const selected = $derived(new Set(value));

  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  const name = $derived(search.trim());
  const exact = $derived(data.labels.some((l) => l.name.toLowerCase() === name.toLowerCase()));

  async function create() {
    creating = true;
    try {
      const color = LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)];
      const result = await createLabel({ projectId: data.project.id, name, color });
      if (!result.ok || !result.label) {
        toast.error(result.ok ? 'Could not create the label.' : result.error);
        return;
      }
      search = '';
      onChange([...value, result.label.id]);
    } finally {
      creating = false;
    }
  }
</script>

<Command filter={keywordFilter}>
  <CommandInput bind:value={search} placeholder="Add labels…" />
  <CommandList>
    <CommandEmpty>{canCreate.current ? 'Type a name to create a label.' : 'No labels found.'}</CommandEmpty>
    <CommandGroup>
      {#each data.labels as label (label.id)}
        <CommandItem
          value={label.id}
          keywords={[label.name]}
          data-checked={selected.has(label.id)}
          onSelect={() => toggle(label.id)}
        >
          <span aria-hidden="true" class="size-2 shrink-0 rounded-full" style:background-color={label.color}></span>
          <span class="truncate">{label.name}</span>
        </CommandItem>
      {/each}
      {#if canCreate.current && name && !exact}
        <!-- forceMount: keep it visible whatever the filter says. -->
        <CommandItem value={CREATE} forceMount disabled={creating} onSelect={() => void create()}>
          <PlusIcon />
          <span class="truncate">
            Create label “{name}”
          </span>
        </CommandItem>
      {/if}
    </CommandGroup>
  </CommandList>
</Command>
