// Epic / milestone / update shapes and constants shared by the server reads
// (src/lib/epics.ts), the actions and the client. Client-safe: no DB imports.

import type { IssueUser, StateType } from '@/lib/issue-model';
import type { EpicStatus } from '@/lib/project-data-types';

export type { EpicStatus };

export const EPIC_STATUSES = [
  'backlog',
  'planned',
  'started',
  'paused',
  'completed',
  'canceled',
] as const satisfies readonly EpicStatus[];

export const EPIC_STATUS_LABEL: Record<EpicStatus, string> = {
  backlog: 'Backlog',
  planned: 'Planned',
  started: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
  canceled: 'Canceled',
};

/** Epic statuses reuse the workflow glyphs; paused = a half pie in amber. */
export const EPIC_STATUS_GLYPH: Record<EpicStatus, { type: StateType; color?: string }> = {
  backlog: { type: 'backlog' },
  planned: { type: 'unstarted' },
  started: { type: 'started' },
  paused: { type: 'started', color: '#f2994a' },
  completed: { type: 'completed', color: '#5e6ad2' },
  canceled: { type: 'canceled' },
};

export function isEpicStatus(value: unknown): value is EpicStatus {
  return typeof value === 'string' && (EPIC_STATUSES as readonly string[]).includes(value);
}

/** Done or dropped — rendered muted on the roadmap and excluded from "Active". */
export const isClosedEpic = (status: EpicStatus) => status === 'completed' || status === 'canceled';

export const HEALTHS = ['on_track', 'at_risk', 'off_track'] as const;
export type Health = (typeof HEALTHS)[number];

export const HEALTH_LABEL: Record<Health, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
};

export const HEALTH_COLOR: Record<Health, string> = {
  on_track: '#4cb782',
  at_risk: '#f2c94c',
  off_track: '#eb5757',
};

export function isHealth(value: unknown): value is Health {
  return typeof value === 'string' && (HEALTHS as readonly string[]).includes(value);
}

export const EPIC_COLORS = [
  '#5e6ad2',
  '#26b5ce',
  '#4cb782',
  '#f2c94c',
  '#f2994a',
  '#eb5757',
  '#bb87fc',
  '#95a2b3',
];
export const DEFAULT_EPIC_COLOR = EPIC_COLORS[0];

export const EPIC_NAME_MAX = 80;
export const EPIC_DESCRIPTION_MAX = 20_000;
export const UPDATE_BODY_MAX = 10_000;

/**
 * Issue progress. Scope = issues not deleted and not canceled (Linear parity:
 * canceled work leaves the denominator); completed = state type "completed".
 */
export interface Progress {
  total: number;
  completed: number;
  started: number;
  /** Sum of estimates in scope / of completed issues. */
  points: number;
  completedPoints: number;
}

export const EMPTY_PROGRESS: Progress = {
  total: 0,
  completed: 0,
  started: 0,
  points: 0,
  completedPoints: 0,
};

/** 0–100, by issue count. */
export function progressPercent(progress: Progress): number {
  return progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
}

/** 0–100 by estimate points, or null when nothing is estimated. */
export function pointsPercent(progress: Progress): number | null {
  return progress.points === 0
    ? null
    : Math.round((progress.completedPoints / progress.points) * 100);
}

export function addProgress(a: Progress, b: Progress): Progress {
  return {
    total: a.total + b.total,
    completed: a.completed + b.completed,
    started: a.started + b.started,
    points: a.points + b.points,
    completedPoints: a.completedPoints + b.completedPoints,
  };
}

export interface EpicRow {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  color: string | null;
  status: EpicStatus;
  health: Health | null;
  lead: IssueUser | null;
  /** YYYY-MM-DD */
  startDate: string | null;
  targetDate: string | null;
  initiativeId: string | null;
  sortOrder: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  progress: Progress;
}

export interface MilestoneRow {
  id: string;
  epicId: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  sortOrder: number;
  progress: Progress;
}

export interface EpicUpdateRow {
  id: string;
  epicId: string;
  author: IssueUser | null;
  health: Health;
  body: string;
  createdAt: Date;
}

export interface InitiativeOption {
  id: string;
  name: string;
  status: string;
}

export const epicPath = (projectId: string, epicId: string) =>
  `/dashboard/projects/${projectId}/epics/${epicId}`;
