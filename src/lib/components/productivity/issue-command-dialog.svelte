<!--
  Linear-style command dialog for one property of one issue, opened by the
  per-issue shortcuts and the palette. Anchored centre-top like the palette.
-->
<script module lang="ts">
  export type IssueCommand = 'status' | 'priority' | 'assignee' | 'labels' | 'estimate' | 'dueDate';
</script>

<script lang="ts">
  import {
    AssigneeOptions,
    DueDateOptions,
    EstimateOptions,
    LabelOptions,
    PriorityOptions,
    StateOptions,
  } from '@/lib/components/issue-pickers';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/lib/components/ui/dialog';
  import type { IssuePatch, IssueRow, Priority } from '@/lib/issue-model';

  const TITLES: Record<IssueCommand, string> = {
    status: 'Change status',
    priority: 'Set priority',
    assignee: 'Assign to',
    labels: 'Change labels',
    estimate: 'Set estimate',
    dueDate: 'Set due date',
  };

  let {
    command,
    issue,
    mutations,
    onClose,
  }: {
    command: IssueCommand | null;
    /** Latest (optimistic) version of the target issue. */
    issue: IssueRow | null;
    mutations: IssueMutations;
    onClose: () => void;
  } = $props();

  const open = $derived(command !== null && issue !== null);
  const done = () => onClose();
  const update = (target: IssueRow, patch: IssuePatch) => mutations.update(target, patch);
</script>

<Dialog bind:open={() => open, (next) => !next && onClose()}>
  <DialogContent
    showCloseButton={false}
    class="top-[15%] max-h-[70vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-md"
  >
    {#if open && issue && command}
      {@const target = issue}
      <div class="flex min-w-0 items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span class="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono">{target.key}</span>
        <span class="truncate">{target.title}</span>
      </div>
      <DialogTitle class="sr-only">{TITLES[command]} — {target.key}</DialogTitle>
      <DialogDescription class="sr-only">Type to filter, Enter to apply, Esc to close.</DialogDescription>
      <div class="min-h-0 overflow-y-auto">
        {#if command === 'status'}
          <StateOptions
            value={target.stateId}
            onSelect={(stateId: string) => {
              update(target, { stateId });
              done();
            }}
          />
        {:else if command === 'priority'}
          <PriorityOptions
            value={target.priority}
            onSelect={(priority: Priority) => {
              update(target, { priority });
              done();
            }}
          />
        {:else if command === 'assignee'}
          <AssigneeOptions
            value={target.assignee?.id ?? null}
            onSelect={(assigneeId: string | null) => {
              update(target, { assigneeId });
              done();
            }}
          />
        {:else if command === 'labels'}
          <!-- Multi-select: stays open, each toggle saves (Esc closes). -->
          <LabelOptions
            value={target.labels.map((l) => l.id)}
            onChange={(labelIds: string[]) => update(target, { labelIds })}
          />
        {:else if command === 'estimate'}
          <EstimateOptions
            value={target.estimate}
            onSelect={(estimate: number | null) => {
              update(target, { estimate });
              done();
            }}
          />
        {:else if command === 'dueDate'}
          <DueDateOptions
            value={target.dueDate}
            onSelect={(dueDate: string | null) => {
              update(target, { dueDate });
              done();
            }}
          />
        {/if}
      </div>
    {/if}
  </DialogContent>
</Dialog>
