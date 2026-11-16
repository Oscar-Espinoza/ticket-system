<!--
  Editor dialog for a recurring issue: title, description, cadence, default
  properties, due offset, with a preview of the next runs.
-->
<script lang="ts">
  import { m, dateFormat } from '@/lib/i18n';
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';

  import { createRecurringIssue, updateRecurringIssue } from '@/lib/actions/recurring';
  import PropertyChips from '@/lib/components/productivity/property-chips.svelte';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { Textarea } from '@/lib/components/ui/textarea';
  import { ToggleGroup, ToggleGroupItem } from '@/lib/components/ui/toggle-group';
  import type { IssuePatch } from '@/lib/issue-model';
  import { toDateInput } from '@/lib/cycle-utils';
  import {
    DUE_IN_DAYS_MAX,
    FREQUENCIES,
    FREQUENCY_LABEL,
    INTERVAL_MAX,
    describeSchedule,
    formatRunDay,
    normalizeSchedule,
    upcomingRuns,
    type Frequency,
    type RecurringIssue,
    type RecurringSchedule,
  } from '@/lib/recurring-schedule';
  import { defaultsToPatch } from './recurring-defaults';

  const PREVIEW_RUNS = 5;
  /** Monday first, as in the rest of the week pickers. */
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const unitWord = (f: Frequency, count: number) =>
    ({
      daily: m.projects_recurring_unit_daily,
      weekly: m.projects_recurring_unit_weekly,
      monthly: m.projects_recurring_unit_monthly,
    })[f]({ count });
  // 2024-01-07 is a Sunday, matching WEEKDAYS order.
  const weekdayName = (d: number) =>
    dateFormat({ weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + d)));
  const weekdayInitials = (d: number) => {
    const name = weekdayName(d);
    return (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 2);
  };
  const frequencyItems = FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }));
  const dayItems = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

  let {
    projectId,
    item,
    open,
    onClose,
  }: {
    projectId: string;
    /** null = new schedule. */
    item: RecurringIssue | null;
    open: boolean;
    onClose: () => void;
  } = $props();

  const data = useProjectData();
  const uid = $props.id();
  // Seeded once; the parent remounts the editor per item ({#key}), like useState.
  const seed = untrack(() => item);
  const today = toDateInput(Date.now());
  let title = $state(seed?.title ?? '');
  let description = $state(seed?.description ?? '');
  let freq = $state<Frequency>(seed?.schedule.freq ?? 'weekly');
  let every = $state(String(seed?.schedule.interval ?? 1));
  let weekdays = $state<number[]>(seed?.schedule.weekdays ?? [new Date().getUTCDay()]);
  let dayOfMonth = $state(seed?.schedule.dayOfMonth ?? new Date().getUTCDate());
  let start = $state(seed?.schedule.start ?? today);
  let properties = $state<IssuePatch>(seed ? defaultsToPatch(seed.data, data) : {});
  let dueInDays = $state(seed?.data.dueInDays != null ? String(seed.data.dueInDays) : '');
  let error = $state<{ field?: string; message: string } | null>(null);
  let saving = $state(false);

  const schedule: RecurringSchedule = $derived({
    freq,
    interval: Number(every),
    start,
    ...(freq === 'weekly' ? { weekdays: [...weekdays] } : {}),
    ...(freq === 'monthly' ? { dayOfMonth } : {}),
  });
  const parsed = $derived(normalizeSchedule(schedule));
  const preview = $derived(
    parsed.ok
      ? upcomingRuns(parsed.schedule, Math.max(Date.parse(today), Date.parse(start)), PREVIEW_RUNS)
      : [],
  );
  const fieldError = (field: string) => (error?.field === field ? error.message : undefined);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const due = dueInDays.trim() === '' ? null : Number(dueInDays);
    const input = {
      projectId,
      title,
      description,
      schedule,
      data: {
        stateId: properties.stateId,
        priority: properties.priority,
        assigneeId: properties.assigneeId ?? null,
        waitingOnId: properties.waitingOnId ?? null,
        labelIds: properties.labelIds ? [...properties.labelIds] : [],
        estimate: properties.estimate ?? null,
        dueInDays: due,
      },
    };
    saving = true;
    try {
      const result = item
        ? await updateRecurringIssue({ ...input, id: item.id })
        : await createRecurringIssue(input);
      if (!result.ok) {
        error = { field: result.field, message: result.error };
        if (!result.field) toast.error(result.error);
        return;
      }
      toast.success(item ? m.projects_recurring_updated() : m.projects_recurring_created());
      onClose();
    } finally {
      saving = false;
    }
  }
</script>

<Dialog bind:open={() => open, (next) => !next && onClose()}>
  <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader>
      <DialogTitle>{item ? m.projects_recurring_edit() : m.projects_recurring_new()}</DialogTitle>
      <DialogDescription>{m.projects_recurring_editor_desc()}</DialogDescription>
    </DialogHeader>
    <form onsubmit={submit} class="flex flex-col gap-4">
      <Field id="{uid}-title" label={m.projects_recurring_title()} error={fieldError('title')}>
        <!-- svelte-ignore a11y_autofocus -->
        <Input
          id="{uid}-title"
          bind:value={title}
          placeholder={m.projects_recurring_title_placeholder()}
          maxlength={200}
          autofocus
          aria-invalid={fieldError('title') ? true : undefined}
        />
      </Field>
      <div class="flex flex-col gap-1.5">
        <Label for="{uid}-description">{m.common_description()}</Label>
        <Textarea
          id="{uid}-description"
          bind:value={description}
          placeholder={m.projects_recurring_description_placeholder()}
          rows={4}
        />
        {#if fieldError('description')}
          <p role="alert" class="text-xs text-destructive">{fieldError('description')}</p>
        {/if}
      </div>

      <fieldset class="flex flex-col gap-3">
        <legend class="mb-1.5 text-sm font-medium">{m.projects_recurring_repeat()}</legend>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <Select
            items={frequencyItems}
            value={freq}
            onValueChange={(v: string) => {
              freq = v as Frequency;
              every = String(Math.min(Number(every) || 1, INTERVAL_MAX[v as Frequency]));
            }}
          >
            <SelectTrigger class="w-32" aria-label={m.projects_recurring_frequency()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {#each frequencyItems as f (f.value)}
                <SelectItem value={f.value}>{f.label}</SelectItem>
              {/each}
            </SelectContent>
          </Select>
          <span class="text-muted-foreground">{m.projects_recurring_every()}</span>
          <!-- One-way value + oninput keeps the raw string (bind:value would coerce). -->
          <Input
            type="number"
            inputmode="numeric"
            min={1}
            max={INTERVAL_MAX[freq]}
            value={every}
            oninput={(e: Event & { currentTarget: HTMLInputElement }) => (every = e.currentTarget.value)}
            class="h-8 w-16 tabular-nums"
            aria-label={m.projects_recurring_every_aria({ unit: unitWord(freq, 2) })}
          />
          <span class="text-muted-foreground">{unitWord(freq, Number(every))}</span>
        </div>
        {#if freq === 'weekly'}
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            spacing={1}
            bind:value={() => weekdays.map(String), (values: string[]) => (weekdays = values.map(Number))}
            aria-label={m.projects_recurring_weekdays()}
          >
            {#each WEEK_ORDER as d (d)}
              <ToggleGroupItem value={String(d)} aria-label={weekdayName(d)} class="w-10 text-xs">
                {weekdayInitials(d)}
              </ToggleGroupItem>
            {/each}
          </ToggleGroup>
        {/if}
        {#if freq === 'monthly'}
          <div class="flex items-center gap-2 text-sm">
            <span class="text-muted-foreground">{m.projects_recurring_on_day()}</span>
            <Select
              items={dayItems}
              value={String(dayOfMonth)}
              onValueChange={(v: string) => (dayOfMonth = Number(v))}
            >
              <SelectTrigger class="w-20" aria-label={m.projects_recurring_day_of_month()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {#each dayItems as d (d.value)}
                  <SelectItem value={d.value}>{d.label}</SelectItem>
                {/each}
              </SelectContent>
            </Select>
            {#if dayOfMonth > 28}
              <span class="text-xs text-muted-foreground">{m.projects_recurring_short_months()}</span>
            {/if}
          </div>
        {/if}
        <div class="flex items-center gap-2 text-sm">
          <Label for="{uid}-start" class="font-normal text-muted-foreground">{m.projects_recurring_starting()}</Label>
          <Input id="{uid}-start" type="date" bind:value={start} class="h-8 w-40" />
        </div>
        <div class="rounded-md bg-muted/40 px-3 py-2 text-xs" aria-live="polite">
          {#if parsed.ok}
            <span class="font-medium">{describeSchedule(parsed.schedule)}.</span>{' '}<span
              class="text-muted-foreground"
            >
              {m.projects_recurring_next({ runs: preview.map((d) => formatRunDay(d)).join(' · ') || m.projects_recurring_next_none() })}
            </span>
          {:else}
            <span class="text-destructive">{parsed.error}</span>
          {/if}
        </div>
        {#if fieldError('schedule')}
          <p role="alert" class="text-xs text-destructive">{fieldError('schedule')}</p>
        {/if}
      </fieldset>

      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{m.projects_properties()}</span>
        <PropertyChips
          value={properties}
          onChange={(patch) => (properties = { ...properties, ...patch })}
          showDueDate={false}
        />
      </div>
      <Field
        id="{uid}-due"
        label={m.projects_recurring_due()}
        hint={m.projects_recurring_due_hint()}
        error={fieldError('dueInDays')}
      >
        <div class="flex items-center gap-2 text-sm">
          <Input
            id="{uid}-due"
            type="number"
            inputmode="numeric"
            min={0}
            max={DUE_IN_DAYS_MAX}
            value={dueInDays}
            oninput={(e: Event & { currentTarget: HTMLInputElement }) => (dueInDays = e.currentTarget.value)}
            placeholder="—"
            class="h-8 w-20 tabular-nums"
          />
          <span class="text-muted-foreground">{m.projects_recurring_due_after()}</span>
        </div>
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" onclick={onClose}>{m.common_cancel()}</Button>
        <Button type="submit" disabled={saving || !title.trim() || !parsed.ok}>
          {item ? m.common_save() : m.projects_recurring_create()}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
