<!-- Epics-list filter: matches epics with any selected label. -->
<script lang="ts">
  import Settings2Icon from '@lucide/svelte/icons/settings-2';
  import TagIcon from '@lucide/svelte/icons/tag';

  import { keywordFilter } from '@/lib/components/issue-pickers';
  import { Button } from '@/lib/components/ui/button';
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
  } from '@/lib/components/ui/command';
  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import { cn } from '@/lib/utils';
  import type { EpicLabelRow } from '@/lib/epic-model';

  let {
    labels,
    counts,
    value,
    onChange,
    onManage,
  }: {
    labels: EpicLabelRow[];
    /** Epics per label id (within the current status filter). */
    counts: Map<string, number>;
    value: string[];
    onChange: (labelIds: string[]) => void;
    /** Omit when the viewer can't manage labels. */
    onManage?: () => void;
  } = $props();

  let open = $state(false);
  const selected = $derived(new Set(value));
  const active = $derived(labels.filter((l) => selected.has(l.id)));
  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
</script>

<Popover bind:open>
  <PopoverTrigger>
    {#snippet child({ props })}
      <Button
        {...props}
        size="sm"
        variant="outline"
        class={cn('gap-1.5 text-xs font-normal', active.length === 0 && 'text-muted-foreground')}
      >
        <TagIcon />
        {active.length === 0
          ? 'Labels'
          : active.length === 1
            ? active[0].name
            : `${active.length} labels`}
      </Button>
    {/snippet}
  </PopoverTrigger>
  <PopoverContent align="start" class="w-60 gap-0 p-0">
    <Command filter={keywordFilter}>
      <CommandInput placeholder="Filter by label…" />
      <CommandList>
        <CommandEmpty>{labels.length ? 'No labels found.' : 'No epic labels yet.'}</CommandEmpty>
        {#if labels.length > 0}
          <CommandGroup>
            {#each labels as label (label.id)}
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
                <span class="flex-1 truncate">{label.name}</span>
                <span class="text-xs text-muted-foreground tabular-nums">
                  {counts.get(label.id) ?? 0}
                </span>
              </CommandItem>
            {/each}
          </CommandGroup>
        {/if}
        {#if value.length > 0 || onManage}
          <CommandSeparator />
          <CommandGroup>
            {#if value.length > 0}
              <CommandItem value="__clear" keywords={['Clear']} onSelect={() => onChange([])}>
                Clear label filter
              </CommandItem>
            {/if}
            {#if onManage}
              <CommandItem
                value="__manage"
                keywords={['Manage labels', 'Edit', 'New label']}
                onSelect={() => {
                  open = false;
                  onManage();
                }}
              >
                <Settings2Icon />
                Manage labels…
              </CommandItem>
            {/if}
          </CommandGroup>
        {/if}
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
