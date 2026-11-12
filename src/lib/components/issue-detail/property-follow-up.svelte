<!--
  "Follow-up" property row: when to follow up (a date, like the due date). The
  daily job notifies the assignee when it arrives (src/lib/cron/jobs/follow-ups.ts).
-->
<script lang="ts">
  import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';

  import PropertyRow from '@/lib/components/issue-detail/property-row.svelte';
  import { DueDatePicker } from '@/lib/components/issue-pickers';
  import DueDateChip from '@/lib/components/issues/due-date-chip.svelte';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import type { IssueRow } from '@/lib/issue-model';

  let { issue, mutations }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
</script>

{#snippet trigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" disabled={!canWrite} class="-ml-2 max-w-full gap-2 font-normal">
    {#if issue.followUp}
      <DueDateChip dueDate={issue.followUp} stateType={issue.state.type} kind="followUp" class="border-0 px-0" />
    {:else}
      <CalendarClockIcon class="text-muted-foreground" />
      <span class="text-muted-foreground">Set follow-up</span>
    {/if}
  </Button>
{/snippet}

<PropertyRow label="Follow-up">
  {#if canWrite}
    <DueDatePicker
      value={issue.followUp}
      placeholder="Follow up on…"
      removeLabel="Remove follow-up date"
      onChange={(followUp) => mutations.update(issue, { followUp })}
    >
      {#snippet children({ props })}{@render trigger(props)}{/snippet}
    </DueDatePicker>
  {:else}
    {@render trigger({})}
  {/if}
</PropertyRow>
