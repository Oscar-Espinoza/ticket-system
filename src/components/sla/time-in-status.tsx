'use client';

// "3d 4h · since Mar 4" for the issue's current state; hovering (or focusing)
// loads how long the issue spent in every state from its activity history.

import { useState } from 'react';

import { getTimeInStatus } from '@/app/actions/sla';
import { useOptionalProjectData } from '@/components/project/project-data';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton, StatusIcon } from '@/components/ui-icons';
import type { IssueRow } from '@/lib/issue-model';
import { formatDuration, type TimeInState } from '@/lib/sla';

const dayFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

/**
 * When the issue entered its current state. Issues from before
 * `stateChangedAt` existed fall back to the matching transition timestamp.
 */
function stateSince(issue: IssueRow): Date {
  if (issue.stateChangedAt) return issue.stateChangedAt;
  const byType = { started: issue.startedAt, completed: issue.completedAt, canceled: issue.canceledAt };
  return byType[issue.state.type as keyof typeof byType] ?? issue.createdAt;
}

type History = { key: string; states: TimeInState[] | null; error?: string };

export function TimeInStatus({ issue, now }: { issue: IssueRow; now: number | null }) {
  const data = useOptionalProjectData();
  const since = new Date(stateSince(issue));
  // Refetch when the state (or the issue) changes.
  const key = `${issue.id}:${issue.stateId}:${since.getTime()}`;
  const [history, setHistory] = useState<History | null>(null);
  const loaded = history?.key === key ? history : null;

  const load = (open: boolean) => {
    if (!open || loaded) return;
    setHistory({ key, states: null });
    void getTimeInStatus({ projectId: issue.projectId, issueId: issue.id })
      .then((result) =>
        setHistory(
          result.ok
            ? { key, states: result.states }
            : { key, states: [], error: "Couldn't load the history." },
        ),
      )
      .catch(() => setHistory({ key, states: [], error: "Couldn't load the history." }));
  };

  const colorOf = (id: string) => data?.states.find((s) => s.id === id)?.color;
  const longest = Math.max(1, ...(loaded?.states ?? []).map((s) => s.ms));

  return (
    <HoverCard openDelay={250} closeDelay={100} onOpenChange={load}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          suppressHydrationWarning
          className="-ml-1 rounded px-1 py-0.5 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            now === null
              ? `In ${issue.state.name} since ${dayFormat.format(since)}`
              : `In ${issue.state.name} for ${formatDuration(now - since.getTime())}, since ${dayFormat.format(since)}. Hover for time in each status.`
          }
        >
          <span className="tabular-nums">
            {now === null ? '—' : formatDuration(now - since.getTime())}
          </span>
          <span className="text-muted-foreground" suppressHydrationWarning>
            {' '}
            · since {dayFormat.format(since)}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Time in status</p>
        {!loaded || loaded.states === null ? (
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-5" />
            <Skeleton className="h-5" />
          </div>
        ) : loaded.error ? (
          <p className="text-xs text-muted-foreground">{loaded.error}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {loaded.states.map((state) => (
              <li key={state.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-xs">
                  <StatusIcon type={state.type} color={colorOf(state.id)} size={14} />
                  <span className="min-w-0 flex-1 truncate">
                    {state.name}
                    {state.current && <span className="text-muted-foreground"> · now</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatDuration(state.ms)}
                  </span>
                </div>
                <span aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-muted-foreground/50"
                    style={{ width: `${Math.max(2, (state.ms / longest) * 100)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
