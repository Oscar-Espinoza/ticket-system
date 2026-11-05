<!--
  Slot — owned by D8. "Start date" property row (issue timeline view planning).
  StartDatePicker lives in ./start-date-picker.svelte.
-->
<script lang="ts">
  import AlertTriangleIcon from '@lucide/svelte/icons/triangle-alert';
  import CalendarArrowUpIcon from '@lucide/svelte/icons/calendar-arrow-up';

  import PropertyRow from '@/lib/components/issue-detail/property-row.svelte';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { formatDueDate } from '@/lib/dates';
  import type { IssueRow } from '@/lib/issue-model';
  import StartDatePicker from './start-date-picker.svelte';

  let { issue, mutations }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
  const afterDue = $derived(issue.startDate !== null && issue.dueDate !== null && issue.startDate > issue.dueDate);
</script>

{#snippet trigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" disabled={!canWrite} class="-ml-2 max-w-full gap-2 font-normal">
    {#if issue.startDate}
      <CalendarArrowUpIcon class="text-muted-foreground" />
      <span>{formatDueDate(issue.startDate)}</span>
      {#if afterDue}
        <AlertTriangleIcon class="text-amber-600 dark:text-amber-400" aria-label="Starts after the due date" />
      {/if}
    {:else}
      <CalendarArrowUpIcon class="text-muted-foreground" />
      <span class="text-muted-foreground">Set start date</span>
    {/if}
  </Button>
{/snippet}

<PropertyRow label="Start date">
  {#if canWrite}
    <StartDatePicker value={issue.startDate} onChange={(startDate) => mutations.update(issue, { startDate })}>
      {#snippet children({ props })}{@render trigger(props)}{/snippet}
    </StartDatePicker>
  {:else}
    {@render trigger({})}
  {/if}
</PropertyRow>
