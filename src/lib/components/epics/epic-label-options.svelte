<!-- Multi-select: toggles stay open; "Create label" when nothing matches exactly. -->
<script module lang="ts">
  import type { EpicLabelRow } from '@/lib/components/epics/epic-model';

  export interface EpicLabelOptionsProps {
    projectId: string;
    labels: EpicLabelRow[];
    value: string[];
    /** Full replacement set. */
    onChange: (labelIds: string[]) => void;
    canCreate: boolean;
  }
</script>

<script lang="ts">
  import PlusIcon from '@lucide/svelte/icons/plus';
  import { toast } from 'svelte-sonner';

  import { createEpicLabel } from '@/lib/actions/epic-labels';
  import { keywordFilter } from '@/lib/components/issue-pickers';
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';
  import { EPIC_COLORS, EPIC_LABEL_NAME_MAX } from '@/lib/components/epics/epic-model';

  const CREATE = '__create';
  const randomColor = () => EPIC_COLORS[Math.floor(Math.random() * EPIC_COLORS.length)];

  let { projectId, labels, value, onChange, canCreate }: EpicLabelOptionsProps = $props();

  let search = $state('');
  // Created here but not yet in the (revalidating) props.
  let created = $state.raw<EpicLabelRow[]>([]);
  let creating = $state(false);
  const all = $derived([...labels, ...created.filter((c) => !labels.some((l) => l.id === c.id))]);
  const selected = $derived(new Set(value));

  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  const name = $derived(search.trim());
  const exact = $derived(all.some((l) => l.name.toLowerCase() === name.toLowerCase()));

  async function create() {
    creating = true;
    try {
      const result = await createEpicLabel({ projectId, name, color: randomColor() });
      if (!result.ok || !result.label) {
        toast.error(result.ok ? 'Could not create the label.' : result.error);
        return;
      }
      const label = result.label;
      created = [...created, label];
      search = '';
      onChange([...value, label.id]);
    } finally {
      creating = false;
    }
  }
</script>

<Command filter={keywordFilter}>
  <CommandInput bind:value={search} placeholder="Add labels…" />
  <CommandList>
    <CommandEmpty>{canCreate ? 'Type a name to create a label.' : 'No labels found.'}</CommandEmpty>
    <CommandGroup>
      {#each all as label (label.id)}
        <CommandItem
          value={label.id}
          keywords={[label.name]}
          data-checked={selected.has(label.id)}
          onSelect={() => toggle(label.id)}
        >
          <span
            aria-hidden="true"
            class="size-2 shrink-0 rounded-full"
            style="background-color: {label.color}"
          ></span>
          <span class="truncate">{label.name}</span>
        </CommandItem>
      {/each}
      {#if canCreate && name && !exact}
        <CommandItem value={CREATE} forceMount disabled={creating} onSelect={create}>
          <PlusIcon />
          <span class="truncate">Create label “{name.slice(0, EPIC_LABEL_NAME_MAX)}”</span>
        </CommandItem>
      {/if}
    </CommandGroup>
  </CommandList>
</Command>
