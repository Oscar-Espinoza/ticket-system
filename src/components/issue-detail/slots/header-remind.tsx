'use client';

// Owner: B2. "Remind me" — a reminder is a `reminder` notification for the
// viewer, hidden (snoozed) until the chosen time, when it surfaces in the inbox.

import { useEffect, useState, useTransition } from 'react';
import { AlarmClock, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { PickerPopover } from '@/components/issue-pickers/picker-popover';
import { formatWhen, reminderPresets } from '@/components/inbox/when-options';
import { WhenPicker } from '@/components/inbox/when-picker';
import { isPendingIssue, type IssueMutations } from '@/components/issues/use-issue-mutations';
import {
  cancelIssueReminder,
  getIssueReminder,
  setIssueReminder,
} from '@/app/actions/notifications';
import type { IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';

export function HeaderRemind({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  void mutations;
  if (isPendingIssue(issue)) return null;
  return <RemindButton key={issue.id} projectId={issue.projectId} ticketId={issue.id} />;
}

function RemindButton({ projectId, ticketId }: { projectId: string; ticketId: string }) {
  const [remindAt, setRemindAt] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    getIssueReminder({ projectId, ticketId })
      .then((result) => {
        if (active && result.ok) setRemindAt(result.remindAt ? new Date(result.remindAt) : null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId, ticketId]);

  const set = (date: Date) => {
    setOpen(false);
    const previous = remindAt;
    setRemindAt(date);
    startTransition(async () => {
      const result = await setIssueReminder({ projectId, ticketId, remindAt: date.toISOString() }).catch(
        () => null,
      );
      if (!result?.ok) {
        setRemindAt(previous);
        toast.error(result?.error ?? 'Could not set the reminder');
        return;
      }
      toast(`Reminder set for ${formatWhen(date)}`, {
        description: 'It will show up in your inbox.',
      });
    });
  };

  const cancel = () => {
    setOpen(false);
    const previous = remindAt;
    setRemindAt(null);
    startTransition(async () => {
      const result = await cancelIssueReminder({ projectId, ticketId }).catch(() => null);
      if (!result?.ok) {
        setRemindAt(previous);
        toast.error(result?.error ?? 'Could not cancel the reminder');
      }
    });
  };

  const label = remindAt ? `Reminder set for ${formatWhen(remindAt)}` : 'Remind me';

  return (
    <PickerPopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-auto min-w-64"
      content={() => (
        <div className="flex flex-col">
          {remindAt ? (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
              <AlarmClock className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{formatWhen(remindAt)}</span>
              <Button variant="ghost" size="xs" onClick={cancel}>
                <X />
                Cancel
              </Button>
            </div>
          ) : (
            <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              Remind me about this issue
            </p>
          )}
          <WhenPicker presets={reminderPresets()} onPick={set} withTime submitLabel="Set reminder" />
        </div>
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        title={label}
        disabled={pending}
        className={cn(remindAt && 'text-primary [&_svg]:text-primary')}
      >
        <AlarmClock />
      </Button>
    </PickerPopover>
  );
}
