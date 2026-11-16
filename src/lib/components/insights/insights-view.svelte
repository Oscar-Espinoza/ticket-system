<script lang="ts">
  import BarChart3Icon from '@lucide/svelte/icons/chart-column';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { EmptyState } from '@/lib/components/ui-icons';
  // Types only: @/lib/insights is server code (db).
  import type { InsightRange, ProjectInsights } from '@/lib/insights-model';
  import { m } from '@/lib/i18n';
  import { cn } from '@/lib/utils';
  import BarList from './bar-list.svelte';
  import { fixed1, formatHours, formatWeek } from './chart-kit.svelte.ts';
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

  const rangeItems = $derived(ranges.map((w) => ({ value: String(w), label: m.editor_ins_last_weeks({ count: w }) })));
  const labelItems = $derived([
    { value: ALL, label: m.editor_ins_all_labels() },
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
      <SelectTrigger size="sm" aria-label={m.editor_ins_date_range()}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {#each ranges as w (w)}
          <SelectItem value={String(w)}>{m.editor_ins_last_weeks({ count: w })}</SelectItem>
        {/each}
      </SelectContent>
    </Select>
    <Select
      type="single"
      bind:value={() => labelId ?? ALL, (v) => setParam('label', v === ALL ? null : v)}
      items={labelItems}
    >
      <SelectTrigger size="sm" aria-label={m.editor_field_label()}>
        <SelectValue>
          {#snippet children()}
            {#if selectedLabel}
              <span aria-hidden="true" class="size-2 rounded-full" style:background-color={selectedLabel.color}></span>
              {selectedLabel.name}
            {:else}
              {m.editor_ins_all_labels()}
            {/if}
          {/snippet}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{m.editor_ins_all_labels()}</SelectItem>
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
        {m.editor_ins_since({ week: formatWeek(data.weeks[0].week) })}
      </span>
    {/if}
  </div>

  <div class={cn('flex flex-col gap-4 transition-opacity', pending && 'opacity-60')} aria-busy={pending}>
    {#if nothing}
      <EmptyState
        title={m.editor_ins_nothing()}
        description={labelId
          ? m.editor_ins_nothing_label()
          : m.editor_ins_nothing_body()}
      >
        {#snippet icon()}<BarChart3Icon />{/snippet}
      </EmptyState>
    {:else}
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <InsightsStat label={m.editor_ins_open_issues()} value={totals.open} />
        <InsightsStat label={m.editor_ins_created()} value={totals.created} hint={m.editor_ins_last_n_weeks({ count: weeks })} />
        <InsightsStat label={m.editor_ins_completed()} value={totals.completed} hint={m.editor_ins_per_week({ avg: fixed1(avgThroughput) })} />
        <InsightsStat
          label={m.editor_ins_median_cycle()}
          value={formatHours(data.cycleTime.medianHours)}
          hint={m.editor_ins_started_done()}
        />
        <InsightsStat
          label={m.editor_ins_median_lead()}
          value={formatHours(data.leadTime.medianHours)}
          hint={m.editor_ins_created_done()}
        />
      </div>

      <InsightsPanel title={m.editor_ins_created_vs_completed()} description={m.editor_ins_created_vs_completed_body()}>
        <TrendChart weeks={data.weeks} />
      </InsightsPanel>

      <div class="grid gap-4 lg:grid-cols-2">
        <InsightsPanel title={m.editor_ins_throughput()} description={m.editor_ins_completed_per_week()}>
          <ColumnChart
            caption={m.editor_ins_completed_per_week()}
            unit={m.editor_ins_unit_completed()}
            showAverage
            data={data.weeks.map((w) => ({
              label: formatWeek(w.week),
              title: m.editor_ins_week_of({ week: formatWeek(w.week) }),
              value: w.completed,
            }))}
          />
        </InsightsPanel>
        <InsightsPanel title={m.editor_ins_by_status()}>
          <BarList rows={data.byState} kind="state" />
        </InsightsPanel>
        <InsightsPanel title={m.editor_ins_by_priority()}>
          <BarList rows={data.byPriority} kind="priority" />
        </InsightsPanel>
        <InsightsPanel title={m.editor_ins_by_assignee()}>
          <BarList rows={data.byAssignee} kind="assignee" />
        </InsightsPanel>
        <InsightsPanel title={m.editor_ins_by_label()}>
          <BarList rows={data.byLabel} kind="label" empty={m.editor_ins_no_labelled()} />
        </InsightsPanel>
        <InsightsPanel
          title={m.editor_ins_cycle_time()}
          description={m.editor_ins_cycle_body({ count: data.cycleTime.count })}
        >
          <ColumnChart
            caption={m.editor_ins_cycle_dist()}
            unit={m.editor_ins_unit_issues()}
            data={data.cycleTime.buckets.map((b) => ({ label: b.label, value: b.count }))}
          />
        </InsightsPanel>
        <InsightsPanel
          title={m.editor_ins_lead_time()}
          description={m.editor_ins_lead_body({ count: data.leadTime.count })}
        >
          <ColumnChart
            caption={m.editor_ins_lead_dist()}
            unit={m.editor_ins_unit_issues()}
            data={data.leadTime.buckets.map((b) => ({ label: b.label, value: b.count }))}
          />
        </InsightsPanel>
      </div>
    {/if}
  </div>
</div>
