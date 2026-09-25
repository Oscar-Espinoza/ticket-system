'use client';

// Month calendar by due date: drag a chip to another day to reschedule, drag
// from / to the "No due date" sidebar to set / clear it.

import { useState } from 'react';
import { DragDropProvider, DragOverlay, PointerSensor, useDraggable, useDroppable } from '@dnd-kit/react';
import { CalendarX2, ChevronLeft, ChevronRight } from 'lucide-react';

import type { IssueViewProps } from '@/components/issues/views';
import { isPendingIssue } from '@/components/issues/use-issue-mutations';
import { useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { StateIcon } from '@/components/ui-icons';
import { addDays, toDateString } from '@/lib/dates';
import type { IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { isClosed } from '@/lib/workflow';

const MAX_CHIPS = 4;
const NO_DATE = 'no-date';
const DAY_PREFIX = 'day:';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const monthFormat = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
const dayFormat = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' });

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Monday-first weeks covering the month (5 or 6 rows). */
function monthDays(month: Date): Date[] {
  const first = monthStart(month);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((((first.getDay() + 6) % 7) + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

type Select = IssueViewProps['onSelect'];

function IssueChip({ issue, onSelect, overlay }: { issue: IssueRow; onSelect?: Select; overlay?: boolean }) {
  const closed = isClosed(issue.state.type);
  return (
    <div
      className={cn(
        'flex h-6 min-w-0 items-center gap-1.5 rounded border border-border bg-card px-1.5 text-xs',
        overlay && 'shadow-popover',
        onSelect && 'cursor-pointer',
      )}
    >
      <StateIcon state={issue.state} size={14} />
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{issue.key}</span>
      <span className={cn('truncate', closed && 'text-muted-foreground line-through')}>{issue.title}</span>
    </div>
  );
}

function DraggableChip({ issue, onSelect }: { issue: IssueRow; onSelect?: Select }) {
  const canWrite = useProjectPermission('write');
  const { ref, isDragSource } = useDraggable({
    id: issue.id,
    type: 'issue',
    disabled: !canWrite || isPendingIssue(issue),
  });
  return (
    <div
      ref={ref}
      tabIndex={0}
      data-issue-chip={issue.id}
      aria-label={`${issue.key} ${issue.title}, ${issue.state.name}`}
      onClick={onSelect ? () => onSelect(issue) : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onSelect && event.target === event.currentTarget) {
          event.preventDefault();
          onSelect(issue);
        }
      }}
      className={cn(
        'rounded outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDragSource && 'opacity-40',
      )}
    >
      <IssueChip issue={issue} onSelect={onSelect} />
    </div>
  );
}

function DayCell({
  date,
  inMonth,
  today,
  issues,
  onSelect,
}: {
  date: string;
  inMonth: boolean;
  today: boolean;
  issues: IssueRow[];
  onSelect?: Select;
}) {
  const { ref, isDropTarget } = useDroppable({ id: `${DAY_PREFIX}${date}`, accept: 'issue' });
  const day = Number(date.slice(8));
  const shown = issues.length > MAX_CHIPS ? issues.slice(0, MAX_CHIPS - 1) : issues;
  const rest = issues.slice(shown.length);
  const label = dayFormat.format(new Date(`${date}T00:00:00`));

  return (
    <div
      ref={ref}
      role="gridcell"
      aria-label={`${label}, ${issues.length} issue${issues.length === 1 ? '' : 's'}`}
      className={cn(
        'flex min-h-28 min-w-0 flex-col gap-1 border-r border-b border-border p-1 transition-colors',
        !inMonth && 'bg-muted/30',
        isDropTarget && 'bg-accent',
      )}
    >
      <span
        className={cn(
          'flex size-6 items-center justify-center self-end rounded-full text-xs tabular-nums',
          today ? 'bg-primary font-medium text-primary-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {day}
      </span>
      {shown.map((issue) => (
        <DraggableChip key={issue.id} issue={issue} onSelect={onSelect} />
      ))}
      {rest.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded px-1.5 text-left text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              +{rest.length} more
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-72 flex-col gap-1 p-2">
            <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">{label}</p>
            {rest.map((issue) => (
              <DraggableChip key={issue.id} issue={issue} onSelect={onSelect} />
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function NoDateSidebar({ issues, onSelect }: { issues: IssueRow[]; onSelect?: Select }) {
  const { ref, isDropTarget } = useDroppable({ id: NO_DATE, accept: 'issue' });
  return (
    <aside
      ref={ref}
      aria-label="No due date"
      className={cn(
        'hidden w-64 shrink-0 flex-col gap-1 rounded-md border border-border p-2 transition-colors lg:flex',
        isDropTarget && 'bg-accent',
      )}
    >
      <h2 className="flex items-center gap-1.5 px-1 pb-1 text-xs font-medium text-muted-foreground">
        <CalendarX2 className="size-3.5" aria-hidden="true" />
        No due date
        <span className="tabular-nums">{issues.length}</span>
      </h2>
      <div className="flex max-h-[calc(100dvh-18rem)] flex-col gap-1 overflow-y-auto">
        {issues.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">Every issue has a due date.</p>
        ) : (
          issues.map((issue) => <DraggableChip key={issue.id} issue={issue} onSelect={onSelect} />)
        )}
      </div>
    </aside>
  );
}

export default function CalendarView({ issues, mutations, onSelect }: IssueViewProps) {
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const today = toDateString(new Date());
  const days = monthDays(month);

  const byDate = new Map<string, IssueRow[]>();
  const undated: IssueRow[] = [];
  for (const issue of issues) {
    if (!issue.dueDate) {
      undated.push(issue);
      continue;
    }
    const list = byDate.get(issue.dueDate);
    if (list) list.push(issue);
    else byDate.set(issue.dueDate, [issue]);
  }
  const shift = (months: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + months, 1));

  return (
    <DragDropProvider
      sensors={[PointerSensor]}
      onDragEnd={(event) => {
        if (event.canceled) return;
        const { source, target } = event.operation;
        const issue = issues.find((i) => i.id === source?.id);
        const targetId = target ? String(target.id) : null;
        if (!issue || !targetId) return;
        const dueDate = targetId === NO_DATE ? null : targetId.slice(DAY_PREFIX.length);
        mutations.update(issue, { dueDate });
      }}
    >
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-medium" aria-live="polite">
              {monthFormat.format(month)}
            </h2>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setMonth(monthStart(new Date()))}>
                Today
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => shift(-1)}>
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => shift(1)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div role="grid" aria-label={monthFormat.format(month)} className="overflow-x-auto rounded-md border-t border-l border-border">
            <div role="row" className="grid min-w-[42rem] grid-cols-7">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  role="columnheader"
                  className="border-r border-b border-border px-2 py-1 text-xs font-medium text-muted-foreground"
                >
                  {day}
                </div>
              ))}
            </div>
            {Array.from({ length: days.length / 7 }, (_, week) => (
              <div key={week} role="row" className="grid min-w-[42rem] grid-cols-7">
                {days.slice(week * 7, week * 7 + 7).map((day) => {
                  const date = toDateString(day);
                  return (
                    <DayCell
                      key={date}
                      date={date}
                      inMonth={day.getMonth() === month.getMonth()}
                      today={date === today}
                      issues={byDate.get(date) ?? []}
                      onSelect={onSelect}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <NoDateSidebar issues={undated} onSelect={onSelect} />
      </div>
      <DragOverlay dropAnimation={null}>
        {(source) => {
          const issue = issues.find((i) => i.id === source.id);
          return issue ? (
            <div className="w-56">
              <IssueChip issue={issue} overlay />
            </div>
          ) : null;
        }}
      </DragOverlay>
    </DragDropProvider>
  );
}
