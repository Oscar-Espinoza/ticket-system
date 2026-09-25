'use client';

// Settings → Cycles & triage. Controlled form; one save for the whole page.

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { updatePlanningSettings } from '@/app/actions/planning-settings';
import { Field } from '@/components/settings/field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { CYCLE_DURATIONS, UPCOMING_CYCLES, WEEKDAYS } from './cycle-utils';

export interface PlanningSettings {
  cyclesEnabled: boolean;
  durationWeeks: number;
  startWeekday: number;
  autoCreate: boolean;
  autoRollover: boolean;
  triageEnabled: boolean;
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-describedby={`${id}-description`}
      />
    </div>
  );
}

export function PlanningSettingsForm({
  projectId,
  initial,
  canEdit,
  hasCycles,
}: {
  projectId: string;
  initial: PlanningSettings;
  canEdit: boolean;
  hasCycles: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof PlanningSettings>(key: K, value: PlanningSettings[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const dirty = (Object.keys(values) as (keyof PlanningSettings)[]).some(
    (key) => values[key] !== saved[key],
  );
  const cadenceChanged =
    hasCycles &&
    (values.durationWeeks !== saved.durationWeeks || values.startWeekday !== saved.startWeekday);
  const disabled = !canEdit || pending;

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await updatePlanningSettings({ projectId, ...values });
      if (!result.ok) {
        toast.error(result.error === 'Forbidden' ? 'Only admins can change these settings.' : result.error);
        return;
      }
      setSaved(values);
      toast.success('Settings saved');
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Only project owners and admins can change these settings.
        </p>
      )}

      <section className="flex flex-col gap-5">
        <h2 className="text-base font-medium">Cycles</h2>
        <ToggleRow
          id="cycles-enabled"
          label="Enable cycles"
          description="Plan work in repeating, time-boxed iterations."
          checked={values.cyclesEnabled}
          onChange={(checked) => set('cyclesEnabled', checked)}
          disabled={disabled}
        />
        <fieldset
          disabled={disabled || !values.cyclesEnabled}
          className="flex flex-col gap-5 disabled:opacity-60"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="cycle-duration" label="Duration">
              <Select
                value={String(values.durationWeeks)}
                onValueChange={(v) => set('durationWeeks', Number(v))}
                disabled={disabled || !values.cyclesEnabled}
              >
                <SelectTrigger id="cycle-duration" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CYCLE_DURATIONS.map((weeks) => (
                    <SelectItem key={weeks} value={String(weeks)}>
                      {weeks} {weeks === 1 ? 'week' : 'weeks'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="cycle-start-day" label="Starts on">
              <Select
                value={String(values.startWeekday)}
                onValueChange={(v) => set('startWeekday', Number(v))}
                disabled={disabled || !values.cyclesEnabled}
              >
                <SelectTrigger id="cycle-start-day" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((day, i) => (
                    <SelectItem key={day} value={String(i)}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {cadenceChanged && (
            <p className="text-xs text-muted-foreground">
              Upcoming cycles that haven&rsquo;t started are rescheduled. The current cycle keeps its
              start and may end a few days later to line up with the new start day.
            </p>
          )}
          <ToggleRow
            id="cycle-auto-create"
            label="Auto-create cycles"
            description={`Keep the current cycle and the next ${UPCOMING_CYCLES} scheduled automatically.`}
            checked={values.autoCreate}
            onChange={(checked) => set('autoCreate', checked)}
            disabled={disabled || !values.cyclesEnabled}
          />
          <ToggleRow
            id="cycle-auto-rollover"
            label="Roll over unfinished issues"
            description={
              values.autoRollover
                ? 'When a cycle ends it is completed automatically and its unfinished issues move to the next cycle.'
                : 'When a cycle ends it is completed automatically; unfinished issues stay in it.'
            }
            checked={values.autoRollover}
            onChange={(checked) => set('autoRollover', checked)}
            disabled={disabled || !values.cyclesEnabled}
          />
        </fieldset>
      </section>

      <Separator />

      <section className="flex flex-col gap-5">
        <h2 className="text-base font-medium">Triage</h2>
        <ToggleRow
          id="triage-enabled"
          label="Enable triage"
          description="Issues from the intake form, the API and people outside the project land in Triage for review before they reach the backlog."
          checked={values.triageEnabled}
          onChange={(checked) => set('triageEnabled', checked)}
          disabled={disabled}
        />
      </section>

      {canEdit && (
        <div>
          <Button type="submit" disabled={pending || !dirty}>
            {pending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}
