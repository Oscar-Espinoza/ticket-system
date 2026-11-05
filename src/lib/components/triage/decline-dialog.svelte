<!-- Decline a triage issue (optional reason). -->
<script lang="ts">
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';

  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { Label } from '@/lib/components/ui/label';
  import { Textarea } from '@/lib/components/ui/textarea';
  import type { IssueRow } from '@/lib/issue-model';
  import { TRIAGE_REASON_MAX } from '@/lib/triage';

  let {
    issue,
    open = $bindable(false),
    onOpenChange,
    pending,
    onDecline,
  }: {
    issue: IssueRow;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    pending: boolean;
    onDecline: (reason: string) => void;
  } = $props();

  let reason = $state('');

  const setOpen = (next: boolean) => {
    if (!next) reason = '';
    open = next;
    onOpenChange?.(next);
  };
</script>

<Dialog bind:open={() => open, setOpen}>
  <DialogContent class="sm:max-w-md">
    <form
      class="flex flex-col gap-4"
      onsubmit={(event) => {
        event.preventDefault();
        onDecline(reason);
      }}
    >
      <DialogHeader>
        <DialogTitle>Decline {issue.key}</DialogTitle>
        <DialogDescription>
          The issue moves to Canceled. The reason is recorded in its activity.
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-1.5">
        <Label for="decline-reason">Reason (optional)</Label>
        <!-- svelte-ignore a11y_autofocus -->
        <Textarea
          id="decline-reason"
          bind:value={reason}
          maxlength={TRIAGE_REASON_MAX}
          rows={3}
          placeholder="e.g. Won't fix, out of scope"
          onkeydown={(e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          autofocus
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onclick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          {#if pending}<LoaderCircle class="animate-spin" />{/if}
          Decline
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
