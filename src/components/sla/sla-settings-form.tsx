'use client';

// Settings → SLAs: a response target per priority (empty = no SLA) and a way
// to re-apply the saved policy to issues that are already open.

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { applySlaPolicyToOpenIssues, updateSlaPolicy } from '@/app/actions/sla';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { PriorityIcon } from '@/components/ui-icons';
import { PRIORITY_LABEL } from '@/lib/issue-model';
import { SLA_MAX_HOURS, SLA_PRIORITIES, type SlaPolicy, type SlaPriority } from '@/lib/sla';

type Unit = 'hours' | 'days';
type Row = { amount: string; unit: Unit };
type Rows = Record<SlaPriority, Row>;

function toRows(policy: SlaPolicy): Rows {
  const rows = {} as Rows;
  for (const priority of SLA_PRIORITIES) {
    const hours = policy[priority];
    rows[priority] =
      hours === undefined
        ? { amount: '', unit: 'hours' }
        : hours % 24 === 0
          ? { amount: String(hours / 24), unit: 'days' }
          : { amount: String(hours), unit: 'hours' };
  }
  return rows;
}

/** Rows → policy, or the first problem. */
function toPolicy(rows: Rows): { policy: SlaPolicy } | { error: string } {
  const policy: SlaPolicy = {};
  for (const priority of SLA_PRIORITIES) {
    const { amount, unit } = rows[priority];
    if (!amount.trim()) continue;
    const value = Number(amount);
    const hours = unit === 'days' ? value * 24 : value;
    if (!Number.isInteger(value) || hours < 1 || hours > SLA_MAX_HOURS) {
      return {
        error: `${PRIORITY_LABEL[priority]}: enter a whole number of ${unit} (up to 365 days).`,
      };
    }
    policy[priority] = hours;
  }
  return { policy };
}

const samePolicy = (a: SlaPolicy, b: SlaPolicy) =>
  SLA_PRIORITIES.every((priority) => a[priority] === b[priority]);

export function SlaSettingsForm({
  projectId,
  initial,
  canEdit,
}: {
  projectId: string;
  initial: SlaPolicy;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState(() => toRows(initial));
  const [saved, setSaved] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const parsed = toPolicy(rows);
  const dirty = 'policy' in parsed ? !samePolicy(parsed.policy, saved) : true;
  const disabled = !canEdit || pending;
  const hasTargets = SLA_PRIORITIES.some((p) => saved[p] !== undefined);

  const set = (priority: SlaPriority, patch: Partial<Row>) =>
    setRows((current) => ({ ...current, [priority]: { ...current[priority], ...patch } }));

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if ('error' in parsed) {
      toast.error(parsed.error);
      return;
    }
    startTransition(async () => {
      const result = await updateSlaPolicy({ projectId, policy: parsed.policy });
      if (!result.ok) {
        toast.error(result.error === 'Forbidden' ? 'Only admins can change SLAs.' : result.error);
        return;
      }
      setSaved(result.policy);
      toast.success('SLAs saved');
    });
  };

  const apply = () =>
    startTransition(async () => {
      const result = await applySlaPolicyToOpenIssues({ projectId });
      if (!result.ok) {
        toast.error(result.error === 'Forbidden' ? 'Only admins can change SLAs.' : result.error);
        return;
      }
      toast.success(
        `Updated ${result.updated} open ${result.updated === 1 ? 'issue' : 'issues'}`,
      );
    });

  return (
    <div className="flex flex-col gap-6">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Only project owners and admins can change SLAs.
        </p>
      )}

      <form onSubmit={save} className="flex flex-col gap-5">
        <fieldset disabled={disabled} className="flex flex-col gap-1">
          <legend className="mb-2 text-sm font-medium">Targets by priority</legend>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {SLA_PRIORITIES.map((priority) => {
              const id = `sla-${priority}`;
              return (
                <li key={priority} className="flex items-center gap-3 px-3 py-2">
                  <PriorityIcon priority={priority} size={14} />
                  <label htmlFor={id} className="flex-1 text-sm">
                    {PRIORITY_LABEL[priority]}
                  </label>
                  <Input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    placeholder="No SLA"
                    value={rows[priority].amount}
                    onChange={(e) => set(priority, { amount: e.target.value })}
                    className="h-8 w-24 tabular-nums"
                  />
                  <Select
                    value={rows[priority].unit}
                    onValueChange={(unit) => set(priority, { unit: unit as Unit })}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      className="w-24"
                      aria-label={`${PRIORITY_LABEL[priority]} SLA unit`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">hours</SelectItem>
                      <SelectItem value="days">days</SelectItem>
                    </SelectContent>
                  </Select>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            The clock starts when an issue is created and restarts when its priority changes.
            Completing or canceling the issue stops it. Leave a priority empty for no SLA.
          </p>
        </fieldset>
        {canEdit && (
          <div>
            <Button type="submit" disabled={pending || !dirty}>
              {pending && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </div>
        )}
      </form>

      {canEdit && (
        <>
          <Separator />
          <section className="flex items-start justify-between gap-6">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-medium">Apply to open issues</h2>
              <p className="text-xs text-muted-foreground">
                New targets only affect new issues and priority changes. Recompute the deadline of
                every open issue from its creation time — issues already past it are marked
                breached without notifying anyone.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={pending || dirty}
              title={dirty ? 'Save your changes first' : undefined}
              onClick={() => setConfirming(true)}
            >
              Apply…
            </Button>
          </section>
        </>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Apply SLAs to open issues?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasTargets
                ? 'Every open issue gets a deadline from its priority and creation time. Issues whose priority has no target lose their SLA.'
                : 'No targets are set, so every open issue loses its SLA.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                apply();
              }}
            >
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
