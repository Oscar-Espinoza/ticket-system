'use client';

import { useId, useState, type ComponentProps } from 'react';
import { CalendarDays, Tag, Triangle, UserRound } from 'lucide-react';

import {
  AssigneePicker,
  DueDatePicker,
  EstimatePicker,
  LabelPicker,
  PriorityPicker,
  StatePicker,
} from '@/components/issue-pickers';
import { useProjectData } from '@/components/project/project-data';
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
import { Textarea } from '@/components/ui/textarea';
import { Avatar, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { formatDueDate } from '@/lib/dates';
import { formatEstimate } from '@/lib/estimates';
import { PRIORITY_LABEL, type IssuePatch } from '@/lib/issue-model';
import { defaultNewIssueState } from '@/lib/workflow';
import type { IssueMutations } from './use-issue-mutations';

/** Property chip trigger; trigger props (ref, onClick, aria-*) come via asChild. */
function Chip(props: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="max-w-48 font-normal text-muted-foreground aria-expanded:text-foreground"
      {...props}
    />
  );
}

const NO_DEFAULTS: IssuePatch = {};

// The dialog closes on submit and the issue appears optimistically; on failure
// it reopens with the draft (this component stays mounted, so state survives).
export function NewIssueDialog({
  open,
  onOpenChange,
  defaults = NO_DEFAULTS,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial properties (e.g. a board column's { stateId }); a new object resets them. */
  defaults?: IssuePatch;
  onCreate: IssueMutations['create'];
}) {
  const { states, members, labels, project } = useProjectData();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [props, setProps] = useState<IssuePatch>(defaults);
  const [propsFor, setPropsFor] = useState(defaults);
  if (defaults !== propsFor) {
    setPropsFor(defaults);
    setProps(defaults);
  }
  const uid = useId();

  const set = (patch: IssuePatch) => setProps((current) => ({ ...current, ...patch }));
  const state = states.find((s) => s.id === props.stateId) ?? defaultNewIssueState(states);
  const priority = props.priority ?? 'none';
  const assignee = members.find((m) => m.id === props.assigneeId);
  const labelIds = props.labelIds ?? [];
  const selectedLabels = labels.filter((l) => labelIds.includes(l.id));

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!title.trim()) return;
    setError(null);
    onOpenChange(false);
    onCreate(
      { ...props, title, description, stateId: props.stateId ?? state?.id },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
        },
        onError: (message) => {
          setError(message);
          onOpenChange(true);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New issue</DialogTitle>
          <DialogDescription className="sr-only">
            Title, description and properties of the new {project.ticketKey} issue.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event);
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-title`}>Title</Label>
            <Input
              id={`${uid}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              maxLength={200}
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${uid}-error` : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-description`}>Description</Label>
            <Textarea
              id={`${uid}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description…"
              rows={5}
            />
          </div>

          <div role="group" aria-label="Properties" className="flex flex-wrap gap-1.5">
            <StatePicker value={state?.id ?? null} onChange={(stateId) => set({ stateId })}>
              <Chip aria-label={`Status: ${state?.name ?? 'none'}`}>
                {state && <StateIcon state={state} size={14} />}
                <span className="truncate text-foreground">{state?.name ?? 'Status'}</span>
              </Chip>
            </StatePicker>

            <PriorityPicker value={priority} onChange={(next) => set({ priority: next })}>
              <Chip aria-label={`Priority: ${PRIORITY_LABEL[priority]}`}>
                <PriorityIcon priority={priority} size={14} />
                <span className={priority !== 'none' ? 'text-foreground' : undefined}>
                  {priority === 'none' ? 'Priority' : PRIORITY_LABEL[priority]}
                </span>
              </Chip>
            </PriorityPicker>

            <AssigneePicker
              value={props.assigneeId ?? null}
              onChange={(assigneeId) => set({ assigneeId })}
            >
              <Chip aria-label={`Assignee: ${assignee?.name ?? 'none'}`}>
                {assignee ? (
                  <>
                    <Avatar name={assignee.name} src={assignee.image} size={20} className="-my-1 size-4" />
                    <span className="truncate text-foreground">{assignee.name}</span>
                  </>
                ) : (
                  <>
                    <UserRound />
                    Assignee
                  </>
                )}
              </Chip>
            </AssigneePicker>

            <LabelPicker value={labelIds} onChange={(next) => set({ labelIds: next })}>
              <Chip aria-label={`Labels: ${selectedLabels.map((l) => l.name).join(', ') || 'none'}`}>
                {selectedLabels.length === 0 ? (
                  <>
                    <Tag />
                    Labels
                  </>
                ) : (
                  <>
                    {selectedLabels.slice(0, 3).map((l) => (
                      <span
                        key={l.id}
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: l.color }}
                      />
                    ))}
                    <span className="truncate text-foreground">
                      {selectedLabels.length === 1
                        ? selectedLabels[0].name
                        : `${selectedLabels.length} labels`}
                    </span>
                  </>
                )}
              </Chip>
            </LabelPicker>

            <EstimatePicker
              value={props.estimate ?? null}
              onChange={(estimate) => set({ estimate })}
            >
              <Chip aria-label="Estimate">
                <Triangle />
                {props.estimate != null ? (
                  <span className="text-foreground">
                    {formatEstimate(project.estimateScale, props.estimate)}
                  </span>
                ) : (
                  'Estimate'
                )}
              </Chip>
            </EstimatePicker>

            <DueDatePicker value={props.dueDate ?? null} onChange={(dueDate) => set({ dueDate })}>
              <Chip aria-label="Due date">
                <CalendarDays />
                {props.dueDate ? (
                  <span className="text-foreground">{formatDueDate(props.dueDate)}</span>
                ) : (
                  'Due date'
                )}
              </Chip>
            </DueDatePicker>
          </div>

          {error && (
            <p id={`${uid}-error`} className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Create issue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
