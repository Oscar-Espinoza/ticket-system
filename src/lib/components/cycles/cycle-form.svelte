<!-- Create / edit form inside CycleFormDialog. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { actionErrorText } from '@/lib/action-errors';
  import { createCycle, updateCycle, type CycleField } from '@/lib/actions/cycles';
  import { projectHref } from '@/lib/components/app-shell/routes';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Textarea } from '@/lib/components/ui/textarea';
  import { DAY_MS, cycleName, lastDay, toDateInput } from '@/lib/cycle-utils';
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
        else toast.error(actionErrorText(result.error, m.projects_no_permission()));
        return;
      }
      toast.success(cycle ? m.projects_cycle_updated() : m.projects_cycle_created());
      onDone();
      if (!cycle) void goto(projectHref(projectId, `cycles/${result.cycleId}`));
    } finally {
      pending = false;
    }
  }
</script>

<form onsubmit={submit} class="flex flex-col gap-4" novalidate>
  <DialogHeader>
    <DialogTitle>{cycle ? m.projects_cycle_edit_title({ name: cycleName(cycle) }) : m.projects_cycle_new()}</DialogTitle>
    <DialogDescription>
      {cycle ? m.projects_cycle_form_edit_desc() : m.projects_cycle_form_new_desc()}
    </DialogDescription>
  </DialogHeader>
  <Field id="cycle-name" label={m.common_name()} hint={m.projects_cycle_name_hint()} error={errors.name}>
    <!-- svelte-ignore a11y_autofocus -->
    <Input
      id="cycle-name"
      bind:value={name}
      maxlength={80}
      placeholder={cycle ? m.projects_cycle_number({ number: cycle.number }) : m.projects_cycle_name_placeholder()}
      aria-invalid={!!errors.name}
      autofocus
    />
  </Field>
  <div class="grid grid-cols-2 gap-3">
    <Field id="cycle-start" label={m.projects_cycle_start_date()} error={errors.startDate}>
      <Input
        id="cycle-start"
        type="date"
        bind:value={startDate}
        disabled={datesLocked}
        aria-invalid={!!errors.startDate}
        required
      />
    </Field>
    <Field id="cycle-end" label={m.projects_cycle_end_date()} error={errors.endDate}>
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
  <Field id="cycle-description" label={m.common_description()} error={errors.description}>
    <Textarea
      id="cycle-description"
      bind:value={description}
      maxlength={500}
      rows={3}
      placeholder={m.projects_cycle_description_placeholder()}
      aria-invalid={!!errors.description}
    />
  </Field>
  <DialogFooter>
    <Button type="button" variant="outline" onclick={onDone}>{m.common_cancel()}</Button>
    <Button type="submit" disabled={pending}>
      {#if pending}<LoaderCircle class="animate-spin" />{/if}
      {cycle ? m.common_save() : m.projects_cycle_create()}
    </Button>
  </DialogFooter>
</form>
