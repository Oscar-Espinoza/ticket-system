<!-- Accept a triage issue (state + optional priority / assignee). -->
<script module lang="ts">
  import type { Priority } from '@/lib/issue-model';

  export interface AcceptChoice {
    stateId: string;
    priority: Priority;
    assigneeId: string | null;
  }
</script>

<script lang="ts">
  import { Dialog, DialogContent } from '@/lib/components/ui/dialog';
  import type { IssueRow } from '@/lib/issue-model';
  import AcceptForm from './accept-form.svelte';

  let {
    issue,
    open = $bindable(false),
    onOpenChange,
    pending,
    onAccept,
  }: {
    issue: IssueRow;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    pending: boolean;
    onAccept: (choice: AcceptChoice) => void;
  } = $props();

  const setOpen = (next: boolean) => {
    open = next;
    onOpenChange?.(next);
  };
</script>

<Dialog bind:open={() => open, setOpen}>
  <DialogContent class="sm:max-w-md">
    {#if open}
      <AcceptForm {issue} {pending} {onAccept} onCancel={() => setOpen(false)} />
    {/if}
  </DialogContent>
</Dialog>
