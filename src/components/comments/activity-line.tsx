'use client';

// One line of issue history: "Ana changed status from Todo to In Progress · 2h".
// issue.updated events expand to one line per change; unknown event types use
// their `data.summary` (the event-bus convention), else "updated the issue".

import type { ReactNode } from 'react';
import { Bot } from 'lucide-react';

import { useProjectData } from '@/components/project/project-data';
import { Avatar, PriorityIcon, StatusIcon } from '@/components/ui-icons';
import { formatDueDate, isDateString } from '@/lib/dates';
import { formatEstimate } from '@/lib/estimates';
import type { IssueChange } from '@/lib/events';
import { isPriority, isStateType, PRIORITY_LABEL } from '@/lib/issue-model';
import type { ProjectData } from '@/lib/project-data-types';
import type { TimelineActivity } from '@/lib/timeline';
import { Timestamp } from './timestamp';

export interface ActivityLineItem extends TimelineActivity {
  /** Set for lines expanded from an issue.updated event. */
  change?: IssueChange;
}

/** One line per issue.updated change; everything else passes through. */
export function expandActivities(activities: TimelineActivity[]): ActivityLineItem[] {
  return activities.flatMap((activity) => {
    const changes = activity.data.changes;
    if (activity.type !== 'issue.updated' || !Array.isArray(changes) || changes.length === 0) {
      return [activity];
    }
    return (changes as IssueChange[]).map((change, i) => ({
      ...activity,
      id: `${activity.id}:${i}`,
      change,
    }));
  });
}

function V({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

type Named = { id?: string; name?: string | null; key?: string; title?: string; type?: string };
const asNamed = (value: unknown): Named | null =>
  value && typeof value === 'object' ? (value as Named) : null;

function list(items: unknown[] | undefined): ReactNode {
  const names = (items ?? []).map((item) => asNamed(item)?.name).filter(Boolean) as string[];
  return names.map((name, i) => (
    <span key={`${name}-${i}`}>
      {i > 0 && ', '}
      <V>{name}</V>
    </span>
  ));
}

function describeChange(change: IssueChange, actorId: string | null, data: ProjectData): ReactNode {
  const from = asNamed(change.from);
  const to = asNamed(change.to);
  switch (change.field) {
    case 'stateId': {
      const glyph = (state: Named | null) => {
        if (!state || !isStateType(state.type)) return null;
        const color = data.states.find((s) => s.id === state.id)?.color;
        return <StatusIcon type={state.type} color={color} size={14} className="mr-1 inline align-[-2px]" />;
      };
      return (
        <>
          changed status from {glyph(from)}
          <V>{from?.name ?? 'unknown'}</V> to {glyph(to)}
          <V>{to?.name ?? 'unknown'}</V>
        </>
      );
    }
    case 'priority': {
      const value = change.to;
      if (!isPriority(value) || value === 'none') return 'removed the priority';
      return (
        <>
          set priority to <PriorityIcon priority={value} size={14} className="mr-1 inline align-[-2px]" />
          <V>{PRIORITY_LABEL[value]}</V>
        </>
      );
    }
    case 'assigneeId':
      if (!to) return from?.name ? <>unassigned <V>{from.name}</V></> : 'unassigned the issue';
      if (to.id && to.id === actorId) return 'self-assigned the issue';
      return from ? (
        <>
          reassigned from <V>{from.name}</V> to <V>{to.name}</V>
        </>
      ) : (
        <>
          assigned the issue to <V>{to.name}</V>
        </>
      );
    case 'labelIds': {
      const added = change.added ?? [];
      const removed = change.removed ?? [];
      return (
        <>
          {added.length > 0 && (
            <>
              added {added.length > 1 ? 'labels' : 'label'} {list(added)}
            </>
          )}
          {added.length > 0 && removed.length > 0 && ' and '}
          {removed.length > 0 && (
            <>
              removed {removed.length > 1 ? 'labels' : 'label'} {list(removed)}
            </>
          )}
        </>
      );
    }
    case 'estimate':
      return typeof change.to === 'number' ? (
        <>
          set the estimate to <V>{formatEstimate(data.project.estimateScale, change.to)}</V>
        </>
      ) : (
        'removed the estimate'
      );
    case 'dueDate':
      return isDateString(change.to) ? (
        <>
          set the due date to <V>{formatDueDate(change.to)}</V>
        </>
      ) : (
        'removed the due date'
      );
    case 'parentId':
      return to ? (
        <>
          set the parent issue to <V>{to.key ? `${to.key} ${to.title ?? ''}`.trim() : 'another issue'}</V>
        </>
      ) : (
        'removed the parent issue'
      );
    case 'cycleId': {
      const name = (cycle: Named | null) => {
        if (!cycle) return null;
        if (cycle.name) return cycle.name;
        const known = data.cycles.find((c) => c.id === cycle.id);
        return known ? `Cycle ${known.number}` : 'a cycle';
      };
      return to ? (
        <>
          added the issue to <V>{name(to)}</V>
        </>
      ) : (
        <>
          removed the issue from <V>{name(from) ?? 'its cycle'}</V>
        </>
      );
    }
    case 'epicId':
      return to ? (
        <>
          moved the issue to epic <V>{to.name ?? 'an epic'}</V>
        </>
      ) : (
        <>
          removed the issue from epic <V>{from?.name ?? ''}</V>
        </>
      );
    case 'milestoneId':
      return to ? (
        <>
          set the milestone to <V>{to.name ?? 'a milestone'}</V>
        </>
      ) : (
        'removed the milestone'
      );
    case 'title':
      return (
        <>
          changed the title to <V>{String(change.to ?? '')}</V>
        </>
      );
    case 'description':
      return 'updated the description';
    default:
      return 'updated the issue';
  }
}

const FIXED: Record<string, string> = {
  'issue.created': 'created the issue',
  'issue.archived': 'archived the issue',
  'issue.unarchived': 'restored the issue from the archive',
  'issue.deleted': 'moved the issue to the trash',
  'issue.restored': 'restored the issue',
};

function describe(line: ActivityLineItem, data: ProjectData): ReactNode {
  if (line.change) return describeChange(line.change, line.actor?.id ?? null, data);
  const fixed = FIXED[line.type];
  if (fixed) return fixed;
  const summary = line.data.summary;
  return typeof summary === 'string' && summary.trim() ? summary : 'updated the issue';
}

export function ActivityLine({ line }: { line: ActivityLineItem }) {
  const data = useProjectData();
  const actorName =
    line.actor?.name ??
    (typeof line.data.actorName === 'string' && line.data.actorName ? line.data.actorName : 'System');

  return (
    <div className="flex items-start gap-2 py-1 pl-0.5 text-xs text-muted-foreground">
      <span className="mt-px flex size-4 shrink-0 items-center justify-center">
        {line.actor ? (
          <Avatar name={line.actor.name} src={line.actor.image} size={20} className="size-4 text-[8px]" />
        ) : (
          <Bot className="size-3.5" aria-hidden />
        )}
      </span>
      <p className="min-w-0 leading-5">
        <V>{actorName}</V> {describe(line, data)}
        <span aria-hidden> · </span>
        <Timestamp date={line.createdAt} />
      </p>
    </div>
  );
}
