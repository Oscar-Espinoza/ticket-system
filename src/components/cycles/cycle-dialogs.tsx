'use client';

// Create / edit a cycle, and complete one (with optional rollover).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  completeCycleAction,
  createCycle,
  updateCycle,
  type CycleField,
} from '@/app/actions/cycles';
import { Field } from '@/components/settings/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { projectHref } from '@/components/app-shell/routes';
import {
  DAY_MS,
  cycleName,
  lastDay,
  toDateInput,
  type CycleLike,
} from './cycle-utils';

export interface EditableCycle extends CycleLike {
  id: string;
  description?: string | null;
}

/** Two weeks from today — only when the caller has no suggestion. */
function defaultRange() {
  const start = Date.now();
  return { startsAt: new Date(start), endsAt: new Date(start + 14 * DAY_MS) };
}

function errorText(error: string) {
  return error === 'Forbidden' ? "You don't have permission to do that." : error;
}

/**
 * Create (no `cycle`) or edit. `suggested` pre-fills new cycles' dates — the
 * day after the latest cycle, for the project's duration.
 */
export function CycleFormDialog({
  projectId,
  open,
  onOpenChange,
  cycle,
  suggested,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycle?: EditableCycle;
  suggested?: { startsAt: Date; endsAt: Date };
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remount per open so the fields reset to the props. */}
        {open && (
          <CycleForm
            projectId={projectId}
            cycle={cycle}
            suggested={suggested}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CycleForm({
  projectId,
  cycle,
  suggested,
  onDone,
}: {
  projectId: string;
  cycle?: EditableCycle;
  suggested?: { startsAt: Date; endsAt: Date };
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(cycle?.name ?? '');
  const [description, setDescription] = useState(cycle?.description ?? '');
  const [[startDate, endDate], setDates] = useState(() => {
    const base = cycle ?? suggested ?? defaultRange();
    return [toDateInput(base.startsAt), toDateInput(lastDay(base))] as const;
  });
  const setStartDate = (value: string) => setDates(([, end]) => [value, end]);
  const setEndDate = (value: string) => setDates(([start]) => [start, value]);
  const [errors, setErrors] = useState<Partial<Record<CycleField, string>>>({});
  const datesLocked = !!cycle?.completedAt;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    startTransition(async () => {
      const input = { projectId, name, description, startDate, endDate };
      const result = cycle
        ? await updateCycle({ ...input, cycleId: cycle.id })
        : await createCycle(input);
      if (!result.ok) {
        if (result.field) setErrors({ [result.field]: result.error });
        else toast.error(errorText(result.error));
        return;
      }
      toast.success(cycle ? 'Cycle updated' : 'Cycle created');
      onDone();
      if (!cycle) router.push(projectHref(projectId, `cycles/${result.cycleId}`));
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{cycle ? `Edit ${cycleName(cycle)}` : 'New cycle'}</DialogTitle>
        <DialogDescription>
          {cycle
            ? 'Rename the cycle or move its dates.'
            : 'A time-boxed iteration. Cycles can’t overlap.'}
        </DialogDescription>
      </DialogHeader>
      <Field id="cycle-name" label="Name" hint="Optional — defaults to “Cycle N”." error={errors.name}>
        <Input
          id="cycle-name"
          value={name}
          maxLength={80}
          placeholder={cycle ? `Cycle ${cycle.number}` : 'e.g. Launch prep'}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!errors.name}
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="cycle-start" label="Start date" error={errors.startDate}>
          <Input
            id="cycle-start"
            type="date"
            value={startDate}
            disabled={datesLocked}
            onChange={(e) => setStartDate(e.target.value)}
            aria-invalid={!!errors.startDate}
            required
          />
        </Field>
        <Field id="cycle-end" label="End date" error={errors.endDate}>
          <Input
            id="cycle-end"
            type="date"
            value={endDate}
            min={startDate}
            disabled={datesLocked}
            onChange={(e) => setEndDate(e.target.value)}
            aria-invalid={!!errors.endDate}
            required
          />
        </Field>
      </div>
      <Field id="cycle-description" label="Description" error={errors.description}>
        <Textarea
          id="cycle-description"
          value={description}
          maxLength={500}
          rows={3}
          placeholder="What is this cycle about?"
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={!!errors.description}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {cycle ? 'Save' : 'Create cycle'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CompleteCycleDialog({
  projectId,
  cycle,
  unfinished,
  nextCycleName,
  open,
  onOpenChange,
}: {
  projectId: string;
  cycle: EditableCycle;
  /** Open issues still in the cycle. */
  unfinished: number;
  /** The cycle unfinished issues would move to; null when there is none. */
  nextCycleName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<'next' | 'keep'>(nextCycleName ? 'next' : 'keep');

  const complete = () =>
    startTransition(async () => {
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
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete {cycleName(cycle)}?</DialogTitle>
          <DialogDescription>
            {unfinished === 0
              ? 'Every issue in this cycle is done.'
              : `${unfinished} issue${unfinished === 1 ? ' is' : 's are'} not finished yet.`}
          </DialogDescription>
        </DialogHeader>
        {unfinished > 0 && (
          <RadioGroup
            value={choice}
            onValueChange={(v) => setChoice(v as 'next' | 'keep')}
            className="gap-3"
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem value="next" id="rollover-next" disabled={!nextCycleName} />
              <Label htmlFor="rollover-next" className="flex-col items-start gap-0.5 font-normal">
                <span>Move them to {nextCycleName ?? 'the next cycle'}</span>
                {!nextCycleName && (
                  <span className="text-xs text-muted-foreground">No upcoming cycle to move to.</span>
                )}
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="keep" id="rollover-keep" />
              <Label htmlFor="rollover-keep" className="font-normal">
                Leave them in this cycle
              </Label>
            </div>
          </RadioGroup>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={complete} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Complete cycle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
