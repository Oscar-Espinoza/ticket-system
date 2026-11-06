<script lang="ts">
  import BarChart3Icon from '@lucide/svelte/icons/chart-column';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { EmptyState } from '@/lib/components/ui-icons';
  // Types only: @/lib/insights is server code (db).
  import type { InsightRange, ProjectInsights } from '@/lib/insights-model';
  import { cn } from '@/lib/utils';
  import BarList from './bar-list.svelte';
  import { formatHours, formatWeek } from './chart-kit.svelte.ts';
  import ColumnChart from './column-chart.svelte';
  import InsightsPanel from './insights-panel.svelte';
  import InsightsStat from './insights-stat.svelte';
  import TrendChart from './trend-chart.svelte';

  const ALL = 'all';

  let {
    data,
    weeks,
    ranges,
    labelId,
  }: {
    data: ProjectInsights;
    weeks: InsightRange;
    ranges: readonly InsightRange[];
    labelId: string | null;
  } = $props();

  const project = useProjectData();
  const labels = $derived(project.labels);

  // In-flight counter: `pending` stays true until the last navigation has loaded.
  let inflight = $state(0);
  const pending = $derived(inflight > 0);

  async function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(page.url.search);
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    inflight++;
    try {
      await goto(query ? `${page.url.pathname}?${query}` : page.url.pathname, { replace: true, reset: false });
    } finally {
      inflight--;
    }
  }

  const totals = $derived(data.totals);
  const nothing = $derived(totals.open === 0 && totals.created === 0 && totals.completed === 0);
  const avgThroughput = $derived(totals.completed / weeks);

  const rangeItems = $derived(ranges.map((w) => ({ value: String(w), label: `Last ${w} weeks` })));
  const labelItems = $derived([
    { value: ALL, label: 'All labels' },
    ...labels.map((l) => ({ value: l.id, label: l.name })),
  ]);
  const selectedLabel = $derived(labels.find((l) => l.id === labelId));
</script>

<div class="flex flex-col gap-4 pb-10">
  <div class="flex flex-wrap items-center gap-2">
    <Select
      type="single"
      bind:value={() => String(weeks), (v) => setParam('range', v)}
      items={rangeItems}
    >
      <SelectTrigger size="sm" aria-label="Date range">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {#each ranges as w (w)}
          <SelectItem value={String(w)}>Last {w} weeks</SelectItem>
        {/each}
      </SelectContent>
    </Select>
    <Select
      type="single"
      bind:value={() => labelId ?? ALL, (v) => setParam('label', v === ALL ? null : v)}
      items={labelItems}
    >
      <SelectTrigger size="sm" aria-label="Label">
        <SelectValue>
          {#snippet children()}
            {#if selectedLabel}
              <span aria-hidden="true" class="size-2 rounded-full" style:background-color={selectedLabel.color}></span>
              {selectedLabel.name}
            {:else}
              All labels
            {/if}
          {/snippet}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All labels</SelectItem>
        {#each labels as l (l.id)}
          <SelectItem value={l.id} label={l.name}>
            <span aria-hidden="true" class="size-2 rounded-full" style:background-color={l.color}></span>
            {l.name}
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
    {#if data.weeks[0]}
      <span class="ml-auto text-xs text-muted-foreground">
        Since {formatWeek(data.weeks[0].week)} · UTC weeks
      </span>
    {/if}
  </div>

  <div class={cn('flex flex-col gap-4 transition-opacity', pending && 'opacity-60')} aria-busy={pending}>
    {#if nothing}
      <EmptyState
        title="Nothing to chart yet"
        description={labelId
          ? 'No issues with this label in the selected range.'
          : 'Create and complete a few issues and their flow shows up here.'}
      >
        {#snippet icon()}<BarChart3Icon />{/snippet}
      </EmptyState>
    {:else}
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <InsightsStat label="Open issues" value={totals.open} />
        <InsightsStat label="Created" value={totals.created} hint={`last ${weeks} weeks`} />
        <InsightsStat label="Completed" value={totals.completed} hint={`${avgThroughput.toFixed(1)} per week`} />
        <InsightsStat
          label="Median cycle time"
          value={formatHours(data.cycleTime.medianHours)}
          hint="started → done"
        />
        <InsightsStat
          label="Median lead time"
          value={formatHours(data.leadTime.medianHours)}
          hint="created → done"
        />
      </div>

      <InsightsPanel title="Created vs completed" description="Issues per week — is the backlog growing?">
        <TrendChart weeks={data.weeks} />
      </InsightsPanel>

      <div class="grid gap-4 lg:grid-cols-2">
        <InsightsPanel title="Throughput" description="Issues completed per week">
          <ColumnChart
            caption="Issues completed per week"
            unit="completed"
            showAverage
            data={data.weeks.map((w) => ({
              label: formatWeek(w.week),
              title: `Week of ${formatWeek(w.week)}`,
              value: w.completed,
            }))}
          />
        </InsightsPanel>
        <InsightsPanel title="Open by status">
          <BarList rows={data.byState} kind="state" />
        </InsightsPanel>
        <InsightsPanel title="Open by priority">
          <BarList rows={data.byPriority} kind="priority" />
        </InsightsPanel>
        <InsightsPanel title="Open by assignee">
          <BarList rows={data.byAssignee} kind="assignee" />
        </InsightsPanel>
        <InsightsPanel title="Open by label">
          <BarList rows={data.byLabel} kind="label" empty="No labelled open issues." />
        </InsightsPanel>
        <InsightsPanel
          title="Cycle time"
          description={`Started → done · ${data.cycleTime.count} issues completed in range`}
        >
          <ColumnChart
            caption="Cycle time distribution"
            unit="issues"
            data={data.cycleTime.buckets.map((b) => ({ label: b.label, value: b.count }))}
          />
        </InsightsPanel>
        <InsightsPanel
          title="Lead time"
          description={`Created → done · ${data.leadTime.count} issues completed in range`}
        >
          <ColumnChart
            caption="Lead time distribution"
            unit="issues"
            data={data.leadTime.buckets.map((b) => ({ label: b.label, value: b.count }))}
          />
        </InsightsPanel>
      </div>
    {/if}
  </div>
</div>
