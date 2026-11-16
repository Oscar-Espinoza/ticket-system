<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { deleteWorkflowState } from '@/lib/actions/workflow-states';
  import { StateIcon } from '@/lib/components/ui-icons';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/lib/components/ui/select';
  import { STATE_TYPE_LABEL, type WorkflowState } from '@/lib/issue-model';
  import { m } from '@/lib/i18n';

  let {
    projectId,
    workflowState,
    states,
    count,
    triageEnabled,
    onClose,
  }: {
    projectId: string;
    workflowState: WorkflowState | null;
    states: WorkflowState[];
    count: number;
    triageEnabled: boolean;
    onClose: () => void;
  } = $props();

  const others = $derived(states.filter((s) => s.id !== workflowState?.id));
  const sameType = $derived(others.filter((s) => s.type === workflowState?.type));
  let picked = $state<string | null>(null);
  let isPending = $state(false);
  // Default: a sibling of the same type, else the first other state.
  const replacementId = $derived(picked ?? sameType[0]?.id ?? others[0]?.id ?? '');
  const replacement = $derived(others.find((s) => s.id === replacementId));
  const items = $derived(others.map((s) => ({ value: s.id, label: s.name })));

  const blocked = $derived.by(() => {
    if (workflowState?.type === 'triage' && triageEnabled) {
      return m.settings_workflow_triage_on();
    }
    if (workflowState && workflowState.type !== 'triage' && sameType.length === 0) {
      return m.settings_workflow_needs_one({
        type: STATE_TYPE_LABEL[workflowState.type].toLowerCase(),
        name: workflowState.name,
      });
    }
    return null;
  });

  function close() {
    picked = null;
    onClose();
  }

  async function confirm() {
    const target = workflowState;
    if (!target || !replacementId) return;
    isPending = true;
    try {
      const result = await deleteWorkflowState({ projectId, id: target.id, replacementId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(m.settings_workflow_deleted_toast({ name: target.name }));
      close();
    } finally {
      isPending = false;
    }
  }
</script>

<Dialog
  open={workflowState !== null}
  onOpenChange={(open) => {
    if (!open) close();
  }}
>
  <DialogContent class="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>{m.settings_workflow_delete_title({ name: workflowState?.name ?? '' })}</DialogTitle>
      <DialogDescription>
        {blocked ??
          (count > 0
            ? m.settings_workflow_in_use({ issues: m.common_issue_count({ count }) })
            : m.settings_workflow_unused())}
      </DialogDescription>
    </DialogHeader>

    {#if !blocked && count > 0}
      <Select bind:value={() => replacementId, (next) => (picked = next)} {items}>
        <SelectTrigger class="w-full" aria-label={m.settings_workflow_move_to()}>
          <SelectValue>
            {#if replacement}
              <StateIcon state={replacement} size={14} />
              {replacement.name}
              <span class="text-xs text-muted-foreground">
                {STATE_TYPE_LABEL[replacement.type]}
              </span>
            {/if}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {#each others as s (s.id)}
            <SelectItem value={s.id}>
              <StateIcon state={s} size={14} />
              {s.name}
              <span class="text-xs text-muted-foreground">
                {STATE_TYPE_LABEL[s.type]}
              </span>
            </SelectItem>
          {/each}
        </SelectContent>
      </Select>
    {/if}

    <DialogFooter>
      <Button variant="outline" onclick={close}>
        {blocked ? m.common_close() : m.common_cancel()}
      </Button>
      {#if !blocked}
        <Button variant="destructive" onclick={confirm} disabled={isPending || !replacementId}>
          {#if isPending}<Loader2Icon class="animate-spin" />{/if}
          {count > 0 ? m.settings_workflow_move_delete() : m.settings_workflow_delete_state()}
        </Button>
      {/if}
    </DialogFooter>
  </DialogContent>
</Dialog>
