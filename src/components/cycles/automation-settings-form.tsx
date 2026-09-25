'use client';

// Settings → Automations: auto-archive and auto-close periods.

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { updateAutomationSettings } from '@/app/actions/planning-settings';
import { Field } from '@/components/settings/field';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { relativeTime } from '@/components/issues/issue-properties';
import { AUTOMATION_MONTHS } from './cycle-utils';

const OFF = 'off';

interface AutomationSettings {
  autoArchiveMonths: number | null;
  autoCloseMonths: number | null;
}

function MonthsSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled: boolean;
}) {
  return (
    <Select
      value={value === null ? OFF : String(value)}
      onValueChange={(v) => onChange(v === OFF ? null : Number(v))}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full max-w-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={OFF}>Off</SelectItem>
        {AUTOMATION_MONTHS.map((months) => (
          <SelectItem key={months} value={String(months)}>
            After {months} {months === 1 ? 'month' : 'months'}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AutomationSettingsForm({
  projectId,
  initial,
  lastRunAt,
  canEdit,
}: {
  projectId: string;
  initial: AutomationSettings;
  lastRunAt: Date | null;
  canEdit: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty =
    values.autoArchiveMonths !== saved.autoArchiveMonths ||
    values.autoCloseMonths !== saved.autoCloseMonths;

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateAutomationSettings({ projectId, ...values });
      if (!result.ok) {
        toast.error(result.error === 'Forbidden' ? 'Only admins can change these settings.' : result.error);
        return;
      }
      setSaved(values);
      toast.success('Automations saved');
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Only project owners and admins can change these settings.
        </p>
      )}
      <Field
        id="auto-archive"
        label="Auto-archive closed issues"
        hint="Completed and canceled issues are archived once they have been closed this long. Archived issues stay searchable and can be restored."
      >
        <MonthsSelect
          id="auto-archive"
          value={values.autoArchiveMonths}
          onChange={(v) => setValues((s) => ({ ...s, autoArchiveMonths: v }))}
          disabled={!canEdit || pending}
        />
      </Field>
      <Field
        id="auto-close"
        label="Auto-close stale issues"
        hint="Triage, backlog and unstarted issues that haven't been updated for this long move to Canceled, with a note in their activity."
      >
        <MonthsSelect
          id="auto-close"
          value={values.autoCloseMonths}
          onChange={(v) => setValues((s) => ({ ...s, autoCloseMonths: v }))}
          disabled={!canEdit || pending}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Issues in the trash are permanently deleted after 30 days.
        {lastRunAt && (
          <span suppressHydrationWarning> Last run {relativeTime(lastRunAt)}.</span>
        )}
      </p>
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
