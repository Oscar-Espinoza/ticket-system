<!--
  "Waiting on" property row: the member the issue is waiting on. Same picker
  as the assignee (project members only).
-->
<script lang="ts">
  import HourglassIcon from '@lucide/svelte/icons/hourglass';

  import PropertyRow from '@/lib/components/issue-detail/property-row.svelte';
  import { AssigneePicker } from '@/lib/components/issue-pickers';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Avatar } from '@/lib/components/ui-icons';
  import type { IssueRow } from '@/lib/issue-model';

  let { issue, mutations }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
</script>

{#snippet trigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" disabled={!canWrite} class="-ml-2 max-w-full gap-2 font-normal">
    {#if issue.waitingOn}
      <Avatar name={issue.waitingOn.name} src={issue.waitingOn.image} size={20} />
      <span class="truncate">{issue.waitingOn.name}</span>
    {:else}
      <HourglassIcon class="text-muted-foreground" />
      <span class="text-muted-foreground">Not waiting</span>
    {/if}
  </Button>
{/snippet}

<PropertyRow label="Waiting on">
  {#if canWrite}
    <AssigneePicker
      value={issue.waitingOn?.id ?? null}
      placeholder="Waiting on…"
      noneLabel="Not waiting on anyone"
      onChange={(waitingOnId) => mutations.update(issue, { waitingOnId })}
    >
      {#snippet children({ props })}{@render trigger(props)}{/snippet}
    </AssigneePicker>
  {:else}
    {@render trigger({})}
  {/if}
</PropertyRow>
