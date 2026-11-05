<!--
  The content of one widget card, by type. Charts reuse the insights kit
  (BarList, TrendChart); lists reuse NavIssueRow (cross-project safe).
-->
<script lang="ts">
  import { epicPath } from '@/lib/components/epics/epic-model';
  import EpicIcon from '@/lib/components/epics/epic-icon.svelte';
  import ProgressRing from '@/lib/components/epics/progress-ring.svelte';
  import BarList from '@/lib/components/insights/bar-list.svelte';
  import TrendChart from '@/lib/components/insights/trend-chart.svelte';
  import NavIssueRow from '@/lib/components/navigation/nav-issue-row.svelte';
  import { StatusIcon } from '@/lib/components/ui-icons';
  import {
    barRows,
    cycleProgress,
    epicProgress,
    formatDays,
    listIssues,
    timeInStatus,
    weekPoints,
    widgetIssues,
  } from '@/lib/components/dashboards/widget-data';
  import type { DashboardDataset, Widget } from '@/lib/components/dashboards/widget-model';

  let { widget, dataset, now }: { widget: Widget; dataset: DashboardDataset; now: number } = $props();

  const inaccessible = $derived(
    !!widget.config.projectId && !dataset.projects.some((p) => p.project.id === widget.config.projectId),
  );
</script>

{#snippet muted(text: string)}
  <p class="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted-foreground">{text}</p>
{/snippet}

{#snippet bar(value: number, total: number, color?: string | null)}
  <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
    <span
      class="block h-full rounded-full bg-primary/80"
      style:width="{total ? Math.round((value / total) * 100) : 0}%"
      style:background-color={color ?? undefined}
    ></span>
  </span>
{/snippet}

{#if inaccessible}
  {@render muted('This widget uses a project you can’t access.')}
{:else if widget.type === 'number'}
  {@const count = widgetIssues(widget, dataset, now).length}
  <div class="flex flex-1 flex-col justify-end">
    <span class="text-4xl font-medium tabular-nums">{count}</span>
    <span class="text-xs text-muted-foreground">{count === 1 ? 'issue' : 'issues'}</span>
  </div>
{:else if widget.type === 'bar'}
  {@const rows = barRows(widget, widgetIssues(widget, dataset, now), dataset)}
  {@const kind =
    widget.config.groupBy === 'state' || widget.config.groupBy === 'priority' || widget.config.groupBy === 'assignee'
      ? widget.config.groupBy
      : 'label'}
  {#if widget.config.groupBy === 'customer' && dataset.customerLinks.length === 0}
    {@render muted('No issues are linked to customers yet.')}
  {:else}
    <BarList {rows} {kind} empty="No matching issues." />
  {/if}
{:else if widget.type === 'line'}
  {@const points = weekPoints(widgetIssues(widget, dataset, now, true), widget.config.weeks, now)}
  <TrendChart weeks={points} />
{:else if widget.type === 'list'}
  {@const issues = listIssues(widget, widgetIssues(widget, dataset, now))}
  {#if issues.length === 0}
    {@render muted('No matching issues.')}
  {:else}
    {@const names = new Map(dataset.projects.map((p) => [p.project.id, p.project.name]))}
    {@const multi = dataset.projects.length > 1 && !widget.config.projectId}
    <div class="-mx-2 flex flex-col gap-px">
      {#each issues as issue (issue.id)}
        <NavIssueRow {issue} project={multi ? names.get(issue.projectId) : undefined} />
      {/each}
    </div>
  {/if}
{:else if widget.type === 'cycle'}
  {@const cycles = cycleProgress(widget, widgetIssues(widget, dataset, now), dataset, now)}
  {#if cycles.length === 0}
    {@render muted('No active cycle.')}
  {:else}
    <ul class="flex flex-col gap-3">
      {#each cycles as { project, cycle, total, completed, started, daysLeft } (cycle.id)}
        {@const percent = total ? Math.round((completed / total) * 100) : 0}
        <li class="flex flex-col gap-1.5">
          <div class="flex items-baseline gap-2 text-sm">
            <a
              href={`/dashboard/projects/${project.id}/cycles/${cycle.id}`}
              class="truncate font-medium hover:underline"
            >
              {cycle.name || `Cycle ${cycle.number}`}
            </a>
            {#if cycles.length > 1}
              <span class="font-mono text-xs text-muted-foreground">{project.ticketKey}</span>
            {/if}
            <span class="ml-auto shrink-0 text-xs text-muted-foreground">
              {daysLeft === 0 ? 'Last day' : `${daysLeft}d left`}
            </span>
          </div>
          <div class="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span class="bg-status-done" style:width="{total ? (completed / total) * 100 : 0}%"></span>
            <span class="bg-amber-500/70" style:width="{total ? (started / total) * 100 : 0}%"></span>
          </div>
          <p class="text-xs text-muted-foreground tabular-nums">
            {percent}% · {completed} done · {started} in progress · {total - completed - started} not started
          </p>
        </li>
      {/each}
    </ul>
  {/if}
{:else if widget.type === 'epic'}
  {@const epics = epicProgress(widget, widgetIssues(widget, dataset, now), dataset)}
  {#if epics.length === 0}
    {@render muted('No epics in scope.')}
  {:else}
    {@const multi = new Set(epics.map((e) => e.projectId)).size > 1}
    <ul class="flex flex-col gap-2">
      {#each epics as { epic, projectId, projectKey, total, done } (epic.id)}
        {@const percent = total ? Math.round((done / total) * 100) : 0}
        <li class="grid grid-cols-[minmax(0,10rem)_1fr_4.5rem] items-center gap-3 text-sm">
          <a href={epicPath(projectId, epic.id)} class="flex min-w-0 items-center gap-2 hover:underline">
            <EpicIcon color={epic.color} />
            <span class="truncate">{epic.name}</span>
            {#if multi}
              <span class="shrink-0 font-mono text-[10px] text-muted-foreground">{projectKey}</span>
            {/if}
          </a>
          {@render bar(done, total, epic.color)}
          <span class="flex items-center justify-end gap-1.5 text-xs text-muted-foreground tabular-nums">
            <ProgressRing {percent} size={14} color={epic.color} />
            {done}/{total}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
{:else if widget.type === 'timeInStatus'}
  {@const rows = timeInStatus(widgetIssues(widget, dataset, now), now)}
  {#if rows.length === 0}
    {@render muted('No open issues.')}
  {:else}
    {@const max = Math.max(...rows.map((r) => r.medianDays), 1 / 24)}
    <ul class="flex flex-col gap-1.5">
      {#each rows as row (row.id)}
        <li
          class="grid grid-cols-[minmax(0,9rem)_1fr_5.5rem] items-center gap-3 text-sm"
          title={`${row.count} issue${row.count === 1 ? '' : 's'} · median ${formatDays(row.medianDays)} · longest ${formatDays(row.maxDays)}`}
        >
          <span class="flex min-w-0 items-center gap-2">
            {#if row.stateType}
              <StatusIcon type={row.stateType} color={row.color ?? undefined} size={14} />
            {/if}
            <span class="truncate">{row.label}</span>
          </span>
          <span class="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span
              class="block h-full rounded-full"
              style:width="{Math.max(2, (row.medianDays / max) * 100)}%"
              style:background-color={row.color ?? undefined}
            ></span>
          </span>
          <span class="text-right text-xs text-muted-foreground tabular-nums">
            {formatDays(row.medianDays)} · {row.count}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
{/if}
