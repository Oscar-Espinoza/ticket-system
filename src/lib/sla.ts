// SLA policy + status helpers and the time-in-status fold. Client-safe (no
// server imports): the settings form, PropertySla, SlaChip and the server
// actions / cron job all share these.
//
// The policy is `project.slaPolicy` = { priority: hours }; the issue service
// sets `ticket.slaDueAt` from it on create and on priority change (the clock
// restarts). Completed / canceled issues stop the clock.

import { PRIORITY_LABEL, type Priority, type StateType } from '@/lib/issue-model';
import { isClosed } from '@/lib/workflow';

export const SLA_PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const satisfies readonly Priority[];
export type SlaPriority = (typeof SLA_PRIORITIES)[number];
export const SLA_MAX_HOURS = 24 * 365;

export type SlaPolicy = Partial<Record<SlaPriority, number>>;

/** Keeps known priorities with whole hours in 1…SLA_MAX_HOURS; null on bad input. */
export function normalizeSlaPolicy(raw: unknown): SlaPolicy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const policy: SlaPolicy = {};
  for (const priority of SLA_PRIORITIES) {
    const hours = input[priority];
    if (hours === undefined || hours === null) continue;
    if (!Number.isInteger(hours) || (hours as number) < 1 || (hours as number) > SLA_MAX_HOURS) {
      return null;
    }
    policy[priority] = hours as number;
  }
  return policy;
}

export function slaPolicyLabel(priority: SlaPriority): string {
  return PRIORITY_LABEL[priority];
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type SlaKind =
  /** Open, comfortably in time. */
  | 'ok'
  /** Open, under a quarter of the window (or an hour) left. */
  | 'risk'
  /** Open and past the deadline. */
  | 'breached'
  /** Closed within the deadline. */
  | 'met'
  /** Closed after the deadline. */
  | 'missed';

export interface SlaStatus {
  kind: SlaKind;
  /** ms until the deadline (negative once past). */
  remaining: number;
}

const HOUR = 3_600_000;

interface SlaIssue {
  slaDueAt: Date | string | null;
  slaBreachedAt: Date | string | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
  state: { type: StateType };
}

const ms = (value: Date | string) => new Date(value).getTime();

export function slaStatus(issue: SlaIssue, now: number = Date.now()): SlaStatus | null {
  // Canceled work has no outcome to measure.
  if (!issue.slaDueAt || issue.state.type === 'canceled') return null;
  const due = ms(issue.slaDueAt);
  if (isClosed(issue.state.type)) {
    const closed = issue.completedAt ? ms(issue.completedAt) : now;
    const late = issue.slaBreachedAt !== null || closed > due;
    return { kind: late ? 'missed' : 'met', remaining: due - closed };
  }
  const remaining = due - now;
  if (remaining <= 0) return { kind: 'breached', remaining };
  // The window is measured from creation — a priority change restarts the
  // clock, which only makes "at risk" show a little later.
  const window = Math.max(due - ms(issue.createdAt), HOUR);
  return { kind: remaining < Math.max(window / 4, HOUR) ? 'risk' : 'ok', remaining };
}

/** "2d 4h", "5h 10m", "12m" (two largest units); `short` keeps only the first. */
export function formatDuration(value: number, short = false): string {
  const minutes = Math.max(0, Math.floor(Math.abs(value) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins && !days) parts.push(`${mins}m`);
  if (parts.length === 0) return '<1m';
  return short ? parts[0] : parts.slice(0, 2).join(' ');
}

// ---------------------------------------------------------------------------
// Time in status
// ---------------------------------------------------------------------------

export interface StateRef {
  id: string;
  name: string;
  type: StateType;
}

export interface StateChange {
  at: Date | string;
  from: StateRef | null;
  to: StateRef | null;
}

export interface TimeInState extends StateRef {
  /** Total ms spent in this state. */
  ms: number;
  /** The issue is in this state now. */
  current: boolean;
}

/**
 * Fold an issue's state changes (oldest first) into time per state, ordered by
 * first entry. Before the first change the issue sat in that change's `from`.
 */
export function timeInStatus(
  createdAt: Date | string,
  changes: StateChange[],
  current: StateRef,
  now: number = Date.now(),
): TimeInState[] {
  const totals = new Map<string, TimeInState>();
  const add = (state: StateRef, start: number, end: number) => {
    const entry = totals.get(state.id);
    if (entry) entry.ms += Math.max(0, end - start);
    else totals.set(state.id, { ...state, ms: Math.max(0, end - start), current: false });
  };
  let state: StateRef | null = changes[0]?.from ?? current;
  let since = ms(createdAt);
  for (const change of changes) {
    const at = ms(change.at);
    if (state) add(state, since, at);
    state = change.to;
    since = at;
  }
  add(current, since, now);
  totals.get(current.id)!.current = true;
  return [...totals.values()];
}
