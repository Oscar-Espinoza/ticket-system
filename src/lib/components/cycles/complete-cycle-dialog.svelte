<!-- Complete a cycle, with optional rollover of its unfinished issues. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { completeCycleAction } from '@/lib/actions/cycles';
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
  import { RadioGroup, RadioGroupItem } from '@/lib/components/ui/radio-group';
  import { cycleName } from '@/lib/components/cycles/cycle-utils';
  import type { EditableCycle } from './cycle-form-dialog.svelte';

  let {
    projectId,
    cycle,
    unfinished,
    nextCycleName,
    open = $bindable(false),
    onOpenChange,
  }: {
    projectId: string;
    cycle: EditableCycle;
    /** Open issues still in the cycle. */
    unfinished: number;
    /** The cycle unfinished issues would move to; null when there is none. */
    nextCycleName: string | null;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  } = $props();

  const setOpen = (next: boolean) => {
    open = next;
    onOpenChange?.(next);
  };

  function errorText(error: string) {
    return error === 'Forbidden' ? "You don't have permission to do that." : error;
  }

  let pending = $state(false);
  // Seeded once; the caller remounts this dialog per open ({#key}) to reset it.
  let choice = $state<'next' | 'keep'>(untrack(() => (nextCycleName ? 'next' : 'keep')));

  async function complete() {
    pending = true;
    try {
      const result = await completeCycleAction({
        projectId,
        cycleId: cycle.id,
        rollover: choice === 'next' && !!nextCycleName,
      });
      if (!result.ok) {
        toast.error(errorText(result.error));
        return;
      }
      toast.success(result.message ?? `${cycleName(cycle)} completed`);
      setOpen(false);
    } finally {
      pending = false;
    }
  }
</script>

<Dialog bind:open={() => open, setOpen}>
  <DialogContent class="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Complete {cycleName(cycle)}?</DialogTitle>
      <DialogDescription>
        {unfinished === 0
          ? 'Every issue in this cycle is done.'
          : `${unfinished} issue${unfinished === 1 ? ' is' : 's are'} not finished yet.`}
      </DialogDescription>
    </DialogHeader>
    {#if unfinished > 0}
      <RadioGroup
        bind:value={() => choice, (v) => (choice = v as 'next' | 'keep')}
        class="gap-3"
      >
        <div class="flex items-start gap-2">
          <RadioGroupItem value="next" id="rollover-next" disabled={!nextCycleName} />
          <Label for="rollover-next" class="flex-col items-start gap-0.5 font-normal">
            <span>Move them to {nextCycleName ?? 'the next cycle'}</span>
            {#if !nextCycleName}
              <span class="text-xs text-muted-foreground">No upcoming cycle to move to.</span>
            {/if}
          </Label>
        </div>
        <div class="flex items-start gap-2">
          <RadioGroupItem value="keep" id="rollover-keep" />
          <Label for="rollover-keep" class="font-normal">Leave them in this cycle</Label>
        </div>
      </RadioGroup>
    {/if}
    <DialogFooter>
      <Button type="button" variant="outline" onclick={() => setOpen(false)}>Cancel</Button>
      <Button onclick={complete} disabled={pending}>
        {#if pending}<LoaderCircle class="animate-spin" />{/if}
        Complete cycle
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
