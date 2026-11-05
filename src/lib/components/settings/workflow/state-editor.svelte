<script lang="ts">
  import { untrack } from 'svelte';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import {
    createWorkflowState,
    updateWorkflowState,
    type WorkflowStateResult,
  } from '@/lib/actions/workflow-states';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import type { StateType, WorkflowState } from '@/lib/issue-model';
  import { DEFAULT_WORKFLOW_STATES } from '@/lib/workflow';
  import ColorPicker from './color-picker.svelte';

  const typeColor = (type: StateType) =>
    DEFAULT_WORKFLOW_STATES.find((state) => state.type === type)?.color ?? '#9da1a8';

  let {
    projectId,
    type,
    workflowState,
    onDone,
  }: {
    projectId: string;
    type: StateType;
    /** Absent = adding a new state of `type`. */
    workflowState?: WorkflowState;
    onDone: () => void;
  } = $props();

  let name = $state(untrack(() => workflowState?.name ?? ''));
  let color = $state(untrack(() => workflowState?.color ?? typeColor(type)));
  let description = $state(untrack(() => workflowState?.description ?? ''));
  let error = $state<Extract<WorkflowStateResult, { ok: false }> | null>(null);
  let isPending = $state(false);
  const focusOnMount = (node: HTMLElement) => node.focus();

  async function save(event?: SubmitEvent) {
    event?.preventDefault();
    isPending = true;
    try {
      const result = workflowState
        ? await updateWorkflowState({ projectId, id: workflowState.id, name, color, description })
        : await createWorkflowState({ projectId, type, name, color, description });
      if (!result.ok) {
        error = result;
        if (!result.field) toast.error(result.error);
        return;
      }
      toast.success(workflowState ? 'State updated' : `Added “${name.trim()}”`);
      onDone();
    } finally {
      isPending = false;
    }
  }
</script>

<li class="px-3 py-2">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <form
    onsubmit={save}
    onkeydown={(e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDone();
      }
    }}
    class="flex flex-col gap-2 sm:flex-row sm:items-center"
  >
    <div class="flex flex-1 items-center gap-2">
      <ColorPicker value={color} onChange={(next) => (color = next)} label="State color" />
      <!-- React autoFocus focuses on mount; Svelte's autofocus only does so when nothing has focus. -->
      <Input
        {@attach focusOnMount}
        bind:value={name}
        placeholder="State name"
        maxlength={40}
        aria-label="State name"
        aria-invalid={error?.field === 'name' ? true : undefined}
        class="h-7 w-40"
      />
      <Input
        bind:value={description}
        placeholder="Description (optional)"
        maxlength={200}
        aria-label="Description"
        class="h-7 min-w-0 flex-1"
      />
    </div>
    <div class="flex justify-end gap-1.5">
      <Button type="button" variant="ghost" size="sm" onclick={onDone}>Cancel</Button>
      <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
        {#if isPending}<Loader2Icon class="animate-spin" />{/if}
        {workflowState ? 'Save' : 'Add state'}
      </Button>
    </div>
  </form>
  {#if error?.field}
    <p role="alert" class="mt-1.5 text-xs text-destructive">
      {error.error}
    </p>
  {/if}
</li>
