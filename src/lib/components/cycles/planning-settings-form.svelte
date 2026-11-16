<!-- Settings → Cycles & triage. Controlled form; one save for the whole page. -->
<script module lang="ts">
  export interface PlanningSettings {
    cyclesEnabled: boolean;
    durationWeeks: number;
    startWeekday: number;
    cooldownWeeks: number;
    autoCreate: boolean;
    autoRollover: boolean;
    triageEnabled: boolean;
  }
</script>

<script lang="ts">
  import { m, dateFormat } from '@/lib/i18n';
  import { untrack } from 'svelte';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { actionErrorText } from '@/lib/action-errors';
  import { updatePlanningSettings } from '@/lib/actions/planning-settings';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Label } from '@/lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { Separator } from '@/lib/components/ui/separator';
  import { Switch } from '@/lib/components/ui/switch';
  import {
    COOLDOWN_OPTIONS,
    CYCLE_DURATIONS,
    UPCOMING_CYCLES,
    WEEKDAYS,
  } from '@/lib/cycle-utils';

  let {
    projectId,
    initial,
    canEdit,
    hasCycles,
  }: {
    projectId: string;
    initial: PlanningSettings;
    canEdit: boolean;
    hasCycles: boolean;
  } = $props();

  // useState(initial): seeded once.
  let values = $state<PlanningSettings>(untrack(() => ({ ...initial })));
  let saved = $state<PlanningSettings>(untrack(() => ({ ...initial })));
  let pending = $state(false);

  const set = <K extends keyof PlanningSettings>(key: K, value: PlanningSettings[K]) => {
    values[key] = value;
  };
  const dirty = $derived(
    (Object.keys(values) as (keyof PlanningSettings)[]).some((key) => values[key] !== saved[key]),
  );
  const cadenceChanged = $derived(
    hasCycles &&
      (values.durationWeeks !== saved.durationWeeks ||
        values.startWeekday !== saved.startWeekday ||
        values.cooldownWeeks !== saved.cooldownWeeks),
  );
  const disabled = $derived(!canEdit || pending);

  const durationItems = CYCLE_DURATIONS.map((weeks) => ({
    value: String(weeks),
    label: m.projects_planning_weeks({ count: weeks }),
  }));
  // 2024-01-07 is a Sunday, matching WEEKDAYS order.
  const weekdayItems = WEEKDAYS.map((_, i) => ({
    value: String(i),
    label: dateFormat({ weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + i))),
  }));
  const cooldownItems = COOLDOWN_OPTIONS.map((weeks) => ({
    value: String(weeks),
    label: weeks === 0 ? m.projects_planning_no_cooldown() : m.projects_planning_weeks({ count: weeks }),
  }));

  async function save(event: SubmitEvent) {
    event.preventDefault();
    pending = true;
    try {
      const snapshot = { ...values };
      const result = await updatePlanningSettings({ projectId, ...snapshot });
      if (!result.ok) {
        toast.error(actionErrorText(result.error, m.projects_automations_admins_only()));
        return;
      }
      saved = snapshot;
      toast.success(m.projects_planning_saved());
    } finally {
      pending = false;
    }
  }
</script>

{#snippet toggleRow(
  id: string,
  label: string,
  description: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
  rowDisabled: boolean,
)}
  <div class="flex items-start justify-between gap-6">
    <div class="flex flex-col gap-0.5">
      <Label for={id}>{label}</Label>
      <p id="{id}-description" class="text-xs text-muted-foreground">{description}</p>
    </div>
    <Switch
      {id}
      bind:checked={() => checked, onChange}
      disabled={rowDisabled}
      aria-describedby="{id}-description"
    />
  </div>
{/snippet}

{#snippet numberSelect(
  id: string,
  items: { value: string; label: string }[],
  current: number,
  onChange: (value: number) => void,
)}
  <Select
    {items}
    value={String(current)}
    onValueChange={(v: string) => onChange(Number(v))}
    disabled={disabled || !values.cyclesEnabled}
  >
    <SelectTrigger {id} class="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {#each items as item (item.value)}
        <SelectItem value={item.value}>{item.label}</SelectItem>
      {/each}
    </SelectContent>
  </Select>
{/snippet}

<form onsubmit={save} class="flex flex-col gap-6">
  {#if !canEdit}
    <p class="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      {m.projects_settings_owners_admins_only()}
    </p>
  {/if}

  <section class="flex flex-col gap-5">
    <h2 class="text-base font-medium">{m.projects_planning_cycles_heading()}</h2>
    {@render toggleRow(
      'cycles-enabled',
      m.projects_planning_enable_cycles(),
      m.projects_planning_enable_cycles_desc(),
      values.cyclesEnabled,
      (checked) => set('cyclesEnabled', checked),
      disabled,
    )}
    <fieldset disabled={disabled || !values.cyclesEnabled} class="flex flex-col gap-5 disabled:opacity-60">
      <div class="grid gap-5 sm:grid-cols-2">
        <Field id="cycle-duration" label={m.projects_planning_duration()}>
          {@render numberSelect('cycle-duration', durationItems, values.durationWeeks, (v) =>
            set('durationWeeks', v),
          )}
        </Field>
        <Field id="cycle-start-day" label={m.projects_planning_starts_on()}>
          {@render numberSelect('cycle-start-day', weekdayItems, values.startWeekday, (v) =>
            set('startWeekday', v),
          )}
        </Field>
        <Field
          id="cycle-cooldown"
          label={m.projects_planning_cooldown()}
          hint={m.projects_planning_cooldown_hint()}
        >
          {@render numberSelect('cycle-cooldown', cooldownItems, values.cooldownWeeks, (v) =>
            set('cooldownWeeks', v),
          )}
        </Field>
      </div>
      {#if cadenceChanged}
        <p class="text-xs text-muted-foreground">
          {m.projects_planning_cadence_changed()}
        </p>
      {/if}
      {@render toggleRow(
        'cycle-auto-create',
        m.projects_planning_auto_create(),
        m.projects_planning_auto_create_desc({ count: UPCOMING_CYCLES }),
        values.autoCreate,
        (checked) => set('autoCreate', checked),
        disabled || !values.cyclesEnabled,
      )}
      {@render toggleRow(
        'cycle-auto-rollover',
        m.projects_planning_rollover(),
        values.autoRollover ? m.projects_planning_rollover_on() : m.projects_planning_rollover_off(),
        values.autoRollover,
        (checked) => set('autoRollover', checked),
        disabled || !values.cyclesEnabled,
      )}
    </fieldset>
  </section>

  <Separator />

  <section class="flex flex-col gap-5">
    <h2 class="text-base font-medium">{m.projects_planning_triage_heading()}</h2>
    {@render toggleRow(
      'triage-enabled',
      m.projects_planning_enable_triage(),
      m.projects_planning_enable_triage_desc(),
      values.triageEnabled,
      (checked) => set('triageEnabled', checked),
      disabled,
    )}
  </section>

  {#if canEdit}
    <div>
      <Button type="submit" disabled={pending || !dirty}>
        {#if pending}<LoaderCircle class="animate-spin" />{/if}
        {m.common_save_changes()}
      </Button>
    </div>
  {/if}
</form>
