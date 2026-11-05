<!--
  Settings › Workflow: the project's states grouped by type, with inline add /
  edit (name, color, description), up/down reordering within a type and
  delete-with-replacement. States come from useProjectData(), which the
  actions refresh by revalidating the project layout.
-->
<script lang="ts">
  import PlusIcon from '@lucide/svelte/icons/plus';

  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { StatusIcon } from '@/lib/components/ui-icons';
  import { Button } from '@/lib/components/ui/button';
  import {
    STATE_TYPE_LABEL,
    STATE_TYPE_ORDER,
    type StateType,
    type WorkflowState,
  } from '@/lib/issue-model';
  import DeleteStateDialog from './delete-state-dialog.svelte';
  import StateEditor from './state-editor.svelte';
  import StateRow from './state-row.svelte';

  const TYPE_HINT: Record<StateType, string> = {
    triage: 'New issues from intake and integrations wait here for review.',
    backlog: 'Ideas and work not yet planned.',
    unstarted: 'Planned work nobody has started.',
    started: 'Work in progress.',
    completed: 'Done. Counts toward progress.',
    canceled: 'Won’t do, duplicates and other closed-without-doing states.',
  };

  let {
    projectId,
    counts,
    canEdit,
  }: {
    projectId: string;
    /** Issues per state id (including archived and trashed). */
    counts: Record<string, number>;
    canEdit: boolean;
  } = $props();

  const data = useProjectData();
  const states = $derived(data.states);
  let editing = $state<string | null>(null);
  let adding = $state<StateType | null>(null);
  let deleting = $state<WorkflowState | null>(null);

</script>

<div class="flex flex-col gap-6">
  {#each STATE_TYPE_ORDER as type (type)}
    {@const ofType = states.filter((s) => s.type === type)}
    <!-- An empty triage group only matters to someone who can add the state. -->
    {#if !(type === 'triage' && ofType.length === 0 && !canEdit)}
      {@const canAdd = canEdit && !(type === 'triage' && ofType.length > 0)}
      <section aria-labelledby="workflow-{type}">
        <div class="mb-1.5 flex items-center gap-2 px-1">
          <StatusIcon {type} size={14} />
          <h2 id="workflow-{type}" class="text-sm font-medium">
            {STATE_TYPE_LABEL[type]}
          </h2>
          <span class="truncate text-xs text-muted-foreground">{TYPE_HINT[type]}</span>
          {#if canAdd}
            <Button
              variant="ghost"
              size="icon-xs"
              class="ml-auto"
              aria-label="Add {STATE_TYPE_LABEL[type].toLowerCase()} state"
              onclick={() => {
                editing = null;
                adding = type;
              }}
            >
              <PlusIcon />
            </Button>
          {/if}
        </div>
        <ul class="flex flex-col divide-y divide-border/60 rounded-lg border">
          {#each ofType as item, index (item.id)}
            {#if editing === item.id}
              <StateEditor {projectId} {type} workflowState={item} onDone={() => (editing = null)} />
            {:else}
              <StateRow
                {projectId}
                workflowState={item}
                count={counts[item.id] ?? 0}
                {canEdit}
                isFirst={index === 0}
                isLast={index === ofType.length - 1}
                onEdit={() => {
                  adding = null;
                  editing = item.id;
                }}
                onDelete={() => (deleting = item)}
              />
            {/if}
          {/each}
          {#if adding === type}
            <StateEditor {projectId} {type} onDone={() => (adding = null)} />
          {/if}
          {#if ofType.length === 0 && adding !== type}
            <li class="px-3 py-2.5 text-sm text-muted-foreground">
              No triage state. Add one to review incoming issues before they reach the backlog.
            </li>
          {/if}
        </ul>
      </section>
    {/if}
  {/each}

  <DeleteStateDialog
    {projectId}
    workflowState={deleting}
    {states}
    count={deleting ? (counts[deleting.id] ?? 0) : 0}
    triageEnabled={data.project.triageEnabled}
    onClose={() => (deleting = null)}
  />
</div>
