<!--
  Bare cycle options (same shape as the issue pickers' options).
  Order: current, upcoming (soonest first), then the 3 most recent past ones.
-->
<script module lang="ts">
  export interface CycleOptionsProps {
    /** Current cycle id; null = none; undefined = mixed (bulk edit). */
    value: string | null | undefined;
    onSelect: (cycleId: string | null) => void;
  }
</script>

<script lang="ts">
  import CircleSlash from '@lucide/svelte/icons/circle-slash';

  import { keywordFilter } from '@/lib/components/issue-pickers/picker-utils';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';
  import type { CycleSummary } from '@/lib/project-data-types';
  import { cycleName, cycleStatus, formatCycleRange } from '@/lib/cycle-utils';
  import CycleGlyph from './cycle-glyph.svelte';

  const NO_CYCLE = '__none';
  const RECENT_PAST = 3;

  let { value, onSelect }: CycleOptionsProps = $props();

  const data = useProjectData();

  const groups = $derived.by(() => {
    const now = new Date();
    const cycles = data.cycles;
    const byStart = [...cycles].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
    const current = byStart.filter((c) => cycleStatus(c, now) === 'current');
    const upcoming = byStart.filter((c) => cycleStatus(c, now) === 'upcoming');
    const past = byStart
      .filter((c) => cycleStatus(c, now) === 'past')
      .reverse()
      .slice(0, RECENT_PAST);
    // Keep the issue's own cycle selectable even when it's an older past one.
    const selected = cycles.find((c) => c.id === value);
    if (selected && ![...current, ...upcoming, ...past].includes(selected)) past.push(selected);
    return { now, current, upcoming, past };
  });
</script>

{#snippet item(cycle: CycleSummary, hint: string)}
  <CommandItem
    value={cycle.id}
    keywords={[cycleName(cycle), `cycle ${cycle.number}`, hint]}
    data-checked={cycle.id === value}
    onSelect={() => onSelect(cycle.id)}
  >
    <CycleGlyph status={cycleStatus(cycle, groups.now)} size={14} />
    <span class="truncate">{cycleName(cycle)}</span>
    <span class="ml-auto shrink-0 text-xs text-muted-foreground">{formatCycleRange(cycle)}</span>
  </CommandItem>
{/snippet}

<Command filter={keywordFilter}>
  <CommandInput placeholder="Move to cycle…" />
  <CommandList>
    <CommandEmpty>No cycle found.</CommandEmpty>
    <CommandGroup>
      <CommandItem
        value={NO_CYCLE}
        keywords={['No cycle', 'Remove from cycle']}
        data-checked={value === null}
        onSelect={() => onSelect(null)}
      >
        <CircleSlash class="text-muted-foreground" />
        No cycle
      </CommandItem>
    </CommandGroup>
    {#if groups.current.length > 0}
      <CommandGroup heading="Current">
        {#each groups.current as c (c.id)}{@render item(c, 'current')}{/each}
      </CommandGroup>
    {/if}
    {#if groups.upcoming.length > 0}
      <CommandGroup heading="Upcoming">
        {#each groups.upcoming as c (c.id)}{@render item(c, 'upcoming next')}{/each}
      </CommandGroup>
    {/if}
    {#if groups.past.length > 0}
      <CommandGroup heading="Past">
        {#each groups.past as c (c.id)}{@render item(c, 'past previous')}{/each}
      </CommandGroup>
    {/if}
  </CommandList>
</Command>
