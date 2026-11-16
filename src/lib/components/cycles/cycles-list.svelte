<!--
  Cycles list: current (with progress), upcoming, past (completion %), and the
  velocity chart. Rows link to the cycle page; "New cycle" opens the form.
-->
<script module lang="ts">
  import type { CycleStatus, CycleTotals } from '@/lib/cycle-utils';

  export interface CycleListItem {
    id: string;
    number: number;
    name: string | null;
    startsAt: Date;
    endsAt: Date;
    completedAt: Date | null;
    status: CycleStatus;
    totals: CycleTotals;
  }
</script>

<script lang="ts">
  import { m } from '@/lib/i18n';
  import type { Snippet } from 'svelte';
  import Plus from '@lucide/svelte/icons/plus';

  import { projectHref } from '@/lib/components/app-shell/routes';
  import { Button } from '@/lib/components/ui/button';
  import { registerPaletteCommands } from '@/lib/svelte/palette-commands.svelte';
  import { cn } from '@/lib/utils';
  import {
    cycleName,
    daysLeft,
    daysUntil,
    formatCycleRange,
    percent,
    type CycleCapacity,
  } from '@/lib/cycle-utils';
  import CapacityBadge from './capacity-badge.svelte';
  import CapacityMeter from './capacity-meter.svelte';
  import CycleFormDialog from './cycle-form-dialog.svelte';
  import CycleGlyph from './cycle-glyph.svelte';
  import CycleProgressBar from './cycle-progress-bar.svelte';
  import CycleStats from './cycle-stats.svelte';
  import VelocityChart, { type VelocityCycle } from './velocity-chart.svelte';

  let {
    projectId,
    current,
    upcoming,
    past,
    velocity,
    capacity,
    cooldownWeeks,
    estimatesEnabled,
    canWrite,
    suggested,
  }: {
    projectId: string;
    current: CycleListItem | null;
    /** Soonest first. */
    upcoming: CycleListItem[];
    /** Newest first. */
    past: CycleListItem[];
    velocity: VelocityCycle[];
    /** Average throughput of the last past cycles; null without history. */
    capacity: CycleCapacity | null;
    cooldownWeeks: number;
    estimatesEnabled: boolean;
    canWrite: boolean;
    suggested: { startsAt: Date; endsAt: Date };
  } = $props();

  let creating = $state(false);

  $effect(() => {
    if (!canWrite) return;
    return registerPaletteCommands([
      {
        id: 'new-cycle',
        label: m.projects_cycle_new_palette(),
        section: m.projects_cycles(),
        keywords: ['sprint', 'iteration', 'create'],
        run: () => (creating = true),
      },
    ]);
  });

  const href = (cycle: CycleListItem) => projectHref(projectId, `cycles/${cycle.id}`);
</script>

{#snippet sectionHeading(id: string, text: string)}
  <h2 {id} class="text-xs font-medium text-muted-foreground">{text}</h2>
{/snippet}

{#snippet cycleRowLink(cycle: CycleListItem, trailing: Snippet<[CycleListItem]>)}
  <li>
    <a
      href={href(cycle)}
      class={cn(
        'flex h-10 items-center gap-3 px-3 text-sm outline-none transition-colors',
        'hover:bg-muted/40 focus-visible:bg-muted/60',
      )}
    >
      <CycleGlyph status={cycle.status} />
      <span class="truncate font-medium">{cycleName(cycle)}</span>
      <span class="hidden text-muted-foreground sm:inline">{formatCycleRange(cycle)}</span>
      <span class="ml-auto flex shrink-0 items-center gap-4 text-xs text-muted-foreground tabular-nums">
        {@render trailing(cycle)}
      </span>
    </a>
  </li>
{/snippet}

{#snippet upcomingTrailing(cycle: CycleListItem)}
  {#if capacity}
    <CapacityBadge totals={cycle.totals} {capacity} {estimatesEnabled} />
  {:else}
    <span>{m.projects_cycle_scope_issues({ count: cycle.totals.scope })}</span>
  {/if}
  <span class="w-24 text-right">{m.projects_cycle_in_days({ count: daysUntil(cycle) })}</span>
{/snippet}

{#snippet pastTrailing(cycle: CycleListItem)}
  <span>{m.projects_cycle_completed_of({ completed: cycle.totals.completed, scope: cycle.totals.scope })}</span>
  <span class="w-24 text-right font-medium text-foreground tabular-nums">
    {percent(cycle.totals.completed, cycle.totals.scope)}%
  </span>
{/snippet}

<div class="flex flex-col gap-8 pb-10">
  <div class="flex items-center gap-2">
    <p class="text-sm text-muted-foreground">
      {m.projects_cycles_intro()}
    </p>
    {#if canWrite}
      <Button size="sm" class="ml-auto" onclick={() => (creating = true)}>
        <Plus />
        {m.projects_cycle_new()}
      </Button>
    {/if}
  </div>

  <section aria-labelledby="cycles-current" class="flex flex-col gap-2">
    {@render sectionHeading('cycles-current', m.projects_cycle_current())}
    {#if current}
      <a
        href={href(current)}
        class="flex flex-col gap-4 rounded-lg border border-border p-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <CycleGlyph status="current" progress={percent(current.totals.completed, current.totals.scope)} />
          <span class="font-medium">{cycleName(current)}</span>
          <span class="text-sm text-muted-foreground">{formatCycleRange(current)}</span>
          <span class="ml-auto text-xs text-muted-foreground">
            {daysLeft(current) === 0 ? m.projects_cycle_last_day() : m.projects_cycle_days_left({ count: daysLeft(current) })}
          </span>
        </div>
        <CycleProgressBar totals={current.totals} />
        <CycleStats totals={current.totals} showPoints={estimatesEnabled} />
        {#if capacity}
          <CapacityMeter totals={current.totals} {capacity} {estimatesEnabled} />
        {/if}
      </a>
    {:else}
      <p
        class="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
      >
        {upcoming[0]
          ? (cooldownWeeks > 0 && past.length > 0
              ? m.projects_cycle_running_cooldown
              : m.projects_cycle_running_none)({
              name: cycleName(upcoming[0]),
              count: daysUntil(upcoming[0]),
            })
          : m.projects_cycle_running_nothing()}
      </p>
    {/if}
  </section>

  {#if upcoming.length > 0}
    <section aria-labelledby="cycles-upcoming" class="flex flex-col gap-2">
      {@render sectionHeading('cycles-upcoming', m.projects_cycle_upcoming())}
      <ul class="flex flex-col divide-y divide-border rounded-lg border border-border">
        {#each upcoming as cycle (cycle.id)}
          {@render cycleRowLink(cycle, upcomingTrailing)}
        {/each}
      </ul>
    </section>
  {/if}

  <VelocityChart cycles={velocity} {estimatesEnabled} />

  {#if past.length > 0}
    <section aria-labelledby="cycles-past" class="flex flex-col gap-2">
      {@render sectionHeading('cycles-past', m.projects_cycle_past())}
      <ul class="flex flex-col divide-y divide-border rounded-lg border border-border">
        {#each past as cycle (cycle.id)}
          {@render cycleRowLink(cycle, pastTrailing)}
        {/each}
      </ul>
    </section>
  {/if}

  <CycleFormDialog {projectId} bind:open={creating} {suggested} />
</div>
