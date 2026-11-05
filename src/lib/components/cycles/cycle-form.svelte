<!-- Create / edit form inside CycleFormDialog (local helper of cycle-dialogs.tsx). -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { createCycle, updateCycle, type CycleField } from '@/lib/actions/cycles';
  import { projectHref } from '@/lib/components/app-shell/routes';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Textarea } from '@/lib/components/ui/textarea';
  import { DAY_MS, cycleName, lastDay, toDateInput } from '@/lib/components/cycles/cycle-utils';
  import type { EditableCycle } from './cycle-form-dialog.svelte';

  let {
    projectId,
    cycle,
    suggested,
    onDone,
  }: {
    projectId: string;
    cycle?: EditableCycle;
    suggested?: { startsAt: Date; endsAt: Date };
    onDone: () => void;
  } = $props();

  /** Two weeks from today — only when the caller has no suggestion. */
  function defaultRange() {
    const start = Date.now();
    return { startsAt: new Date(start), endsAt: new Date(start + 14 * DAY_MS) };
  }

  function errorText(error: string) {
    return error === 'Forbidden' ? "You don't have permission to do that." : error;
  }

  // The form is remounted per open, so these seed from the props once (useState).
  const initial = untrack(() => {
    const base = cycle ?? suggested ?? defaultRange();
    return {
      name: cycle?.name ?? '',
      description: cycle?.description ?? '',
      startDate: toDateInput(base.startsAt),
      endDate: toDateInput(lastDay(base)),
    };
  });
  let pending = $state(false);
  let name = $state(initial.name);
  let description = $state(initial.description);
  let startDate = $state(initial.startDate);
  let endDate = $state(initial.endDate);
  let errors = $state<Partial<Record<CycleField, string>>>({});
  const datesLocked = $derived(!!cycle?.completedAt);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    errors = {};
    pending = true;
    try {
      const input = { projectId, name, description, startDate, endDate };
      const result = cycle
        ? await updateCycle({ ...input, cycleId: cycle.id })
        : await createCycle(input);
      if (!result.ok) {
        if (result.field) errors = { [result.field]: result.error };
        else toast.error(errorText(result.error));
        return;
      }
      toast.success(cycle ? 'Cycle updated' : 'Cycle created');
      onDone();
      if (!cycle) void goto(projectHref(projectId, `cycles/${result.cycleId}`));
    } finally {
      pending = false;
    }
  }
</script>

<form onsubmit={submit} class="flex flex-col gap-4" novalidate>
  <DialogHeader>
    <DialogTitle>{cycle ? `Edit ${cycleName(cycle)}` : 'New cycle'}</DialogTitle>
    <DialogDescription>
      {cycle ? 'Rename the cycle or move its dates.' : 'A time-boxed iteration. Cycles can’t overlap.'}
    </DialogDescription>
  </DialogHeader>
  <Field id="cycle-name" label="Name" hint="Optional — defaults to “Cycle N”." error={errors.name}>
    <!-- svelte-ignore a11y_autofocus -->
    <Input
      id="cycle-name"
      bind:value={name}
      maxlength={80}
      placeholder={cycle ? `Cycle ${cycle.number}` : 'e.g. Launch prep'}
      aria-invalid={!!errors.name}
      autofocus
    />
  </Field>
  <div class="grid grid-cols-2 gap-3">
    <Field id="cycle-start" label="Start date" error={errors.startDate}>
      <Input
        id="cycle-start"
        type="date"
        bind:value={startDate}
        disabled={datesLocked}
        aria-invalid={!!errors.startDate}
        required
      />
    </Field>
    <Field id="cycle-end" label="End date" error={errors.endDate}>
      <Input
        id="cycle-end"
        type="date"
        bind:value={endDate}
        min={startDate}
        disabled={datesLocked}
        aria-invalid={!!errors.endDate}
        required
      />
    </Field>
  </div>
  <Field id="cycle-description" label="Description" error={errors.description}>
    <Textarea
      id="cycle-description"
      bind:value={description}
      maxlength={500}
      rows={3}
      placeholder="What is this cycle about?"
      aria-invalid={!!errors.description}
    />
  </Field>
  <DialogFooter>
    <Button type="button" variant="outline" onclick={onDone}>Cancel</Button>
    <Button type="submit" disabled={pending}>
      {#if pending}<LoaderCircle class="animate-spin" />{/if}
      {cycle ? 'Save' : 'Create cycle'}
    </Button>
  </DialogFooter>
</form>
