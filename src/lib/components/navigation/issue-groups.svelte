<!--
  Cross-project issue list grouped by workflow state *type* (projects have
  different states, but the categories are shared). Closed groups start
  collapsed; "Hide completed" drops them entirely.
  Port of src/components/navigation/issue-groups.tsx.
-->
<script module lang="ts">
  import { STATE_TYPE_LABEL, type StateType } from '@/lib/issue-model';

  const GROUP_ORDER: StateType[] = ['started', 'unstarted', 'backlog', 'triage', 'completed', 'canceled'];

  const GROUP_LABEL: Record<StateType, string> = {
    ...STATE_TYPE_LABEL,
    started: 'In progress',
    unstarted: 'Todo',
  };
</script>

<script lang="ts">
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/lib/components/ui/collapsible';
  import { Label } from '@/lib/components/ui/label';
  import { Switch } from '@/lib/components/ui/switch';
  import { StatusIcon } from '@/lib/components/ui-icons';
  import type { IssueRow } from '@/lib/issue-model';
  import { isClosed } from '@/lib/workflow';
  import NavList from './list-navigation.svelte';
  import NavIssueRow from './nav-issue-row.svelte';

  let {
    issues,
    projectNames,
  }: {
    issues: IssueRow[];
    /** projectId → name, for the project chip. */
    projectNames: Record<string, string>;
  } = $props();

  let hideCompleted = $state(false);

  const groups = $derived(
    GROUP_ORDER.filter((type) => !(hideCompleted && isClosed(type)))
      .map((type) => ({ type, issues: issues.filter((issue) => issue.state.type === type) }))
      .filter((group) => group.issues.length > 0),
  );
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-end gap-2">
    <Switch id="hide-completed" size="sm" bind:checked={hideCompleted} />
    <Label for="hide-completed" class="text-xs font-normal text-muted-foreground">Hide completed</Label>
  </div>

  {#if groups.length === 0}
    <p class="py-8 text-center text-sm text-muted-foreground">Every issue here is completed or canceled.</p>
  {:else}
    <NavList class="flex flex-col gap-2">
      {#each groups as group (group.type)}
        <Collapsible defaultOpen={!isClosed(group.type)}>
          <CollapsibleTrigger
            class="group/trigger flex h-8 w-full items-center gap-2 rounded-md bg-muted/50 px-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRightIcon
              class="size-3.5 text-muted-foreground transition-transform group-data-[state=open]/trigger:rotate-90"
            />
            <StatusIcon type={group.type} size={14} />
            {GROUP_LABEL[group.type]}
            <span class="text-xs font-normal tabular-nums text-muted-foreground">
              {group.issues.length}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent class="mt-1 flex flex-col gap-px">
            {#each group.issues as issue (issue.id)}
              <NavIssueRow {issue} project={projectNames[issue.projectId]} />
            {/each}
          </CollapsibleContent>
        </Collapsible>
      {/each}
    </NavList>
  {/if}
</div>
