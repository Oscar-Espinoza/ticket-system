<script lang="ts">
  import type { ProjectOverviewView } from '@/lib/server/mcp/contracts';
  import { toDateString } from '@/lib/dates';
  import { host } from './lib/app.svelte';
  import { cyclePercent, shortDate, typeSegments } from './lib/model';
  import Burndown from './Burndown.svelte';
  import Chip from './Chip.svelte';
  import IssueRows from './IssueRows.svelte';
  import OpenLink from './OpenLink.svelte';

  let { data }: { data: ProjectOverviewView } = $props();

  const bar = $derived(typeSegments(data.countsByStateType));
  const cycle = $derived(data.cycle);
  const percent = $derived(cycle ? cyclePercent(cycle) : 0);
  const today = toDateString(new Date());
  const locale = $derived(host.context.locale);
  const range = (c: NonNullable<typeof cycle>) => `${shortDate(c.startsAt.slice(0, 10), locale, today)} – ${shortDate(c.endsAt.slice(0, 10), locale, today)}`;
</script>

<section class="space-y-4" aria-label="{data.project.name} overview">
  <header class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <p class="font-code text-fg2">{data.project.key}</p>
      <h1 class="text-[1.2em] leading-snug font-semibold [overflow-wrap:anywhere]">{data.project.name}</h1>
    </div>
    <OpenLink url={data.project.url} label="Open in Ticket System" compact />
  </header>

  {#if cycle}
    <div class="space-y-2 rounded-view border border-line p-3">
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 class="min-w-0 font-semibold [overflow-wrap:anywhere]">Cycle {cycle.number}{cycle.name ? ` · ${cycle.name}` : ''}</h2>
        <span class="flex items-center gap-2 text-fg2">
          <Chip tone={cycle.status === 'current' ? 'ok' : 'neutral'}>{cycle.status}</Chip>
          <span>{range(cycle)}</span>
        </span>
      </div>
      <div>
        <div class="flex items-baseline justify-between text-fg2">
          <span><span class="text-[1.4em] font-semibold text-fg">{percent}%</span> done</span>
          <span>{`${cycle.totals.completed}/${cycle.totals.scope} issues${cycle.totals.scopePoints ? ` · ${cycle.totals.completedPoints}/${cycle.totals.scopePoints} pts` : ''}`}</span>
        </div>
        <div class="mt-1 h-2 overflow-hidden rounded-full bg-bg3" role="progressbar" aria-label="Cycle progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
          <div class="h-full rounded-full" style:width="{percent}%" style:background="var(--tk-type-completed)"></div>
        </div>
        <p class="mt-1 text-fg2">{cycle.totals.started} in progress</p>
      </div>
      <Burndown {cycle} />
    </div>
  {:else}
    <p class="rounded-view border border-dashed border-line2 px-3 py-3 text-fg2">No cycle is running.</p>
  {/if}

  <div class="space-y-2">
    <h2 class="font-semibold">{data.mode === 'cycle' ? 'All project issues by state' : 'Issues by state'} <span class="font-normal text-fg2">({bar.total})</span></h2>
    {#if bar.total === 0}
      <p class="text-fg2">No issues yet.</p>
    {:else}
      <div class="flex h-3 overflow-hidden rounded-full bg-bg3" role="img" aria-label={bar.segments.map((s) => `${s.label} ${s.count}`).join(', ')}>
        {#each bar.segments as seg (seg.type)}
          <div style:width="{seg.percent}%" style:background="var(--tk-type-{seg.type}, var(--tk-fg-3))" title="{seg.label}: {seg.count}"></div>
        {/each}
      </div>
      <ul class="flex flex-wrap gap-x-4 gap-y-1">
        {#each bar.segments as seg (seg.type)}
          <li class="inline-flex items-center gap-1.5 text-fg2">
            <span class="size-2.5 rounded-sm" style:background="var(--tk-type-{seg.type}, var(--tk-fg-3))"></span>{seg.label}
            <span class="font-medium text-fg">{seg.count}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="space-y-1">
    <h2 class="font-semibold">{data.mode === 'cycle' ? 'Open issues in this cycle' : 'Recently updated'}</h2>
    {#if data.issues.length}
      <div class="overflow-hidden rounded-view border border-line px-1">
        <IssueRows issues={data.issues} />
      </div>
    {:else}
      <p class="text-fg2">{data.mode === 'cycle' ? 'No open issues in this cycle.' : 'Nothing yet.'}</p>
    {/if}
  </div>
</section>
