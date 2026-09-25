'use client';

// Accept (state + optional priority / assignee), decline (optional reason) and
// mark-duplicate (issue search) dialogs for the triage page.

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { useProjectData } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { keywordFilter } from '@/components/issue-pickers/picker-popover';
import { PRIORITY_LABEL, PRIORITY_ORDER, type IssueRow, type Priority } from '@/lib/issue-model';
import { TRIAGE_REASON_MAX, acceptStates, defaultAcceptState } from '@/lib/triage';

const UNASSIGNED = '__none';

export interface AcceptChoice {
  stateId: string;
  priority: Priority;
  assigneeId: string | null;
}

export function AcceptDialog({
  issue,
  open,
  onOpenChange,
  pending,
  onAccept,
}: {
  issue: IssueRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onAccept: (choice: AcceptChoice) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <AcceptForm
            issue={issue}
            pending={pending}
            onAccept={onAccept}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AcceptForm({
  issue,
  pending,
  onAccept,
  onCancel,
}: {
  issue: IssueRow;
  pending: boolean;
  onAccept: (choice: AcceptChoice) => void;
  onCancel: () => void;
}) {
  const { states, members } = useProjectData();
  const options = acceptStates(states);
  const [stateId, setStateId] = useState(defaultAcceptState(states)?.id ?? options[0]?.id ?? '');
  const [priority, setPriority] = useState<Priority>(issue.priority);
  const [assigneeId, setAssigneeId] = useState(issue.assignee?.id ?? UNASSIGNED);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!stateId) return;
        onAccept({ stateId, priority, assigneeId: assigneeId === UNASSIGNED ? null : assigneeId });
      }}
    >
      <DialogHeader>
        <DialogTitle>Accept {issue.key}</DialogTitle>
        <DialogDescription className="truncate">{issue.title}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-[5rem_1fr] items-center gap-x-3 gap-y-3">
        <Label htmlFor="accept-state" className="text-xs text-muted-foreground">
          Status
        </Label>
        <Select value={stateId} onValueChange={setStateId}>
          <SelectTrigger id="accept-state" className="w-full">
            <SelectValue placeholder="Pick a status" />
          </SelectTrigger>
          <SelectContent>
            {options.map((state) => (
              <SelectItem key={state.id} value={state.id}>
                <StateIcon state={state} size={14} />
                {state.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label htmlFor="accept-priority" className="text-xs text-muted-foreground">
          Priority
        </Label>
        <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
          <SelectTrigger id="accept-priority" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_ORDER.map((p) => (
              <SelectItem key={p} value={p}>
                <PriorityIcon priority={p} size={14} />
                {PRIORITY_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label htmlFor="accept-assignee" className="text-xs text-muted-foreground">
          Assignee
        </Label>
        <Select value={assigneeId} onValueChange={setAssigneeId}>
          <SelectTrigger id="accept-assignee" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <Avatar name={m.name} src={m.image} size={20} />
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {options.length === 0 && (
        <p className="text-sm text-destructive">
          This project has no backlog, unstarted or started states to accept into.
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !stateId} autoFocus>
          {pending && <Loader2 className="animate-spin" />}
          Accept
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeclineDialog({
  issue,
  open,
  onOpenChange,
  pending,
  onDecline,
}: {
  issue: IssueRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onDecline: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onDecline(reason);
          }}
        >
          <DialogHeader>
            <DialogTitle>Decline {issue.key}</DialogTitle>
            <DialogDescription>
              The issue moves to Canceled. The reason is recorded in its activity.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="decline-reason">Reason (optional)</Label>
            <Textarea
              id="decline-reason"
              value={reason}
              maxLength={TRIAGE_REASON_MAX}
              rows={3}
              placeholder="e.g. Won't fix, out of scope"
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Decline
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DuplicateDialog({
  issue,
  candidates,
  open,
  onOpenChange,
  onPick,
}: {
  issue: IssueRow;
  /** Issues it may duplicate (the triage issue itself excluded by the caller). */
  candidates: IssueRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (original: IssueRow) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Mark {issue.key} as duplicate</DialogTitle>
          <DialogDescription>Search for the original issue.</DialogDescription>
        </DialogHeader>
        <Command filter={keywordFilter}>
          <CommandInput placeholder={`${issue.key} is a duplicate of…`} autoFocus />
          <CommandList className="max-h-80">
            <CommandEmpty>No issue found.</CommandEmpty>
            <CommandGroup>
              {candidates.map((candidate) => (
                <CommandItem
                  key={candidate.id}
                  value={candidate.id}
                  keywords={[candidate.key, candidate.title]}
                  onSelect={() => onPick(candidate)}
                >
                  <StateIcon state={candidate.state} size={14} />
                  <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                    {candidate.key}
                  </span>
                  <span className="truncate">{candidate.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
