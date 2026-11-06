<!--
  The card body (also the drag overlay).
-->
<script lang="ts">
  import { useDisplayOptions } from '@/lib/components/issues/display-options.svelte';
  import DueDateChip from '@/lib/components/issues/due-date-chip.svelte';
  import EstimateChip from '@/lib/components/issues/estimate-chip.svelte';
  import LabelChips from '@/lib/components/issues/label-chips.svelte';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import SlaChip from '@/lib/components/sla/sla-chip.svelte';
  import { Avatar, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import CycleChip from '@/lib/components/views/cycle-chip.svelte';
  import EpicChip from '@/lib/components/views/epic-chip.svelte';
  import MilestoneChip from '@/lib/components/views/milestone-chip.svelte';
  import StartDateChip from '@/lib/components/views/start-date-chip.svelte';
  import SubIssueChip from '@/lib/components/views/sub-issue-chip.svelte';
  import { useSubIssueCount } from '@/lib/components/views/view-context.svelte';
  import type { IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';

  let { issue, class: className }: { issue: IssueRow; class?: string } = $props();

  const data = useProjectData();
  const display = useDisplayOptions();
  const show = $derived(display.current.properties);
  const subIssues = useSubIssueCount(() => issue.id);
  const showSubCount = $derived(
    (show.subIssues || !display.current.showSubIssues) && subIssues.current !== null,
  );
  const footer = $derived(
    (show.priority && issue.priority !== 'none') ||
      (show.labels && issue.labels.length > 0) ||
      (show.estimate && issue.estimate !== null && data.project.estimateScale !== 'none') ||
      (show.dueDate && issue.dueDate !== null) ||
      (show.startDate && issue.startDate !== null) ||
      // SlaChip renders nothing without a deadline (and hides itself when closed).
      (show.sla && issue.slaDueAt !== null) ||
      (show.cycle && issue.cycleId !== null) ||
      (show.epic && issue.epicId !== null) ||
      (show.milestone && issue.milestoneId !== null) ||
      showSubCount,
  );
</script>

<div class={cn('flex flex-col gap-2 rounded-md border border-border bg-card p-3 text-sm', className)}>
  <div class="flex items-center gap-2 text-xs text-muted-foreground">
    {#if show.status}<StateIcon state={issue.state} size={14} />{/if}
    {#if show.id}<span class="font-mono">{issue.key}</span>{/if}
    {#if show.assignee && issue.assignee}
      <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} class="ml-auto" />
    {/if}
  </div>
  <p class="line-clamp-2 text-card-foreground">{issue.title}</p>
  {#if footer}
    <div class="flex flex-wrap items-center gap-1.5">
      {#if show.priority && issue.priority !== 'none'}
        <span class="inline-flex h-5 items-center rounded border border-border px-1">
          <PriorityIcon priority={issue.priority} size={14} />
        </span>
      {/if}
      {#if showSubCount}<SubIssueChip count={subIssues.current} />{/if}
      {#if show.estimate}<EstimateChip scale={data.project.estimateScale} value={issue.estimate} />{/if}
      {#if show.startDate}<StartDateChip startDate={issue.startDate} />{/if}
      {#if show.dueDate}<DueDateChip dueDate={issue.dueDate} stateType={issue.state.type} />{/if}
      {#if show.sla}<SlaChip {issue} />{/if}
      {#if show.cycle}<CycleChip cycleId={issue.cycleId} />{/if}
      {#if show.epic}<EpicChip epicId={issue.epicId} />{/if}
      {#if show.milestone}<MilestoneChip epicId={issue.epicId} milestoneId={issue.milestoneId} />{/if}
      {#if show.labels}<LabelChips labels={issue.labels} max={2} />{/if}
    </div>
  {/if}
</div>
