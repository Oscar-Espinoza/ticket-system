<!-- Complete a cycle, with optional rollover of its unfinished issues. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { untrack } from 'svelte';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { actionErrorText } from '@/lib/action-errors';
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
  import { cycleName } from '@/lib/cycle-utils';
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
        toast.error(actionErrorText(result.error, m.projects_no_permission()));
        return;
      }
      toast.success(result.message ?? m.projects_complete_cycle_done({ name: cycleName(cycle) }));
      setOpen(false);
    } finally {
      pending = false;
    }
  }
</script>

<Dialog bind:open={() => open, setOpen}>
  <DialogContent class="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>{m.projects_complete_cycle_title({ name: cycleName(cycle) })}</DialogTitle>
      <DialogDescription>
        {unfinished === 0
          ? m.projects_complete_cycle_all_done()
          : m.projects_complete_cycle_unfinished({ count: unfinished })}
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
            <span>{m.projects_complete_cycle_move_to({ name: nextCycleName ?? m.projects_complete_cycle_next() })}</span>
            {#if !nextCycleName}
              <span class="text-xs text-muted-foreground">{m.projects_complete_cycle_no_upcoming()}</span>
            {/if}
          </Label>
        </div>
        <div class="flex items-start gap-2">
          <RadioGroupItem value="keep" id="rollover-keep" />
          <Label for="rollover-keep" class="font-normal">{m.projects_complete_cycle_leave()}</Label>
        </div>
      </RadioGroup>
    {/if}
    <DialogFooter>
      <Button type="button" variant="outline" onclick={() => setOpen(false)}>{m.common_cancel()}</Button>
      <Button onclick={complete} disabled={pending}>
        {#if pending}<LoaderCircle class="animate-spin" />{/if}
        {m.projects_complete_cycle()}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
