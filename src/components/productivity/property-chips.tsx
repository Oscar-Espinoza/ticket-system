'use client';

// Property chips (status, priority, assignee, labels, estimate, due date) for
// forms that build an IssuePatch: the new-issue dialog and the template editor.

import type { ComponentProps } from 'react';
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
import { Avatar, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { formatDueDate } from '@/lib/dates';
import { formatEstimate } from '@/lib/estimates';
import { PRIORITY_LABEL, type IssuePatch, type WorkflowState } from '@/lib/issue-model';

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

export function PropertyChips({
  value,
  onChange,
  fallbackState,
  showDueDate = true,
}: {
  value: IssuePatch;
  onChange: (patch: IssuePatch) => void;
  /** Shown when `value.stateId` is unset (the state a new issue would get). */
  fallbackState?: WorkflowState;
  /** Templates have no due date. */
  showDueDate?: boolean;
}) {
  const { states, members, labels, project } = useProjectData();
  const state = states.find((s) => s.id === value.stateId) ?? fallbackState;
  const priority = value.priority ?? 'none';
  const assignee = members.find((m) => m.id === value.assigneeId);
  const labelIds = value.labelIds ?? [];
  const selectedLabels = labels.filter((l) => labelIds.includes(l.id));

  return (
    <div role="group" aria-label="Properties" className="flex flex-wrap gap-1.5">
      <StatePicker value={state?.id ?? null} onChange={(stateId) => onChange({ stateId })}>
        <Chip aria-label={`Status: ${state?.name ?? 'none'}`}>
          {state && <StateIcon state={state} size={14} />}
          <span className="truncate text-foreground">{state?.name ?? 'Status'}</span>
        </Chip>
      </StatePicker>

      <PriorityPicker value={priority} onChange={(next) => onChange({ priority: next })}>
        <Chip aria-label={`Priority: ${PRIORITY_LABEL[priority]}`}>
          <PriorityIcon priority={priority} size={14} />
          <span className={priority !== 'none' ? 'text-foreground' : undefined}>
            {priority === 'none' ? 'Priority' : PRIORITY_LABEL[priority]}
          </span>
        </Chip>
      </PriorityPicker>

      <AssigneePicker
        value={value.assigneeId ?? null}
        onChange={(assigneeId) => onChange({ assigneeId })}
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

      <LabelPicker value={labelIds} onChange={(next) => onChange({ labelIds: next })}>
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
        value={value.estimate ?? null}
        onChange={(estimate) => onChange({ estimate })}
      >
        <Chip aria-label="Estimate">
          <Triangle />
          {value.estimate != null ? (
            <span className="text-foreground">
              {formatEstimate(project.estimateScale, value.estimate)}
            </span>
          ) : (
            'Estimate'
          )}
        </Chip>
      </EstimatePicker>

      {showDueDate && (
        <DueDatePicker value={value.dueDate ?? null} onChange={(dueDate) => onChange({ dueDate })}>
          <Chip aria-label="Due date">
            <CalendarDays />
            {value.dueDate ? (
              <span className="text-foreground">{formatDueDate(value.dueDate)}</span>
            ) : (
              'Due date'
            )}
          </Chip>
        </DueDatePicker>
      )}
    </div>
  );
}
