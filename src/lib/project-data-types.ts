// Shape of the per-project data the project layout loads once and hands to
// every client component via ProjectDataProvider. Client-safe (types only).

import type { EstimateScale } from '@/lib/estimates';
import type { IssueLabel, IssueUser, WorkflowState } from '@/lib/issue-model';
import type { ProjectRole } from '@/lib/roles';

export interface ProjectInfo {
  id: string;
  name: string;
  ticketKey: string;
  description: string | null;
  /** The viewer's role in this project. */
  role: ProjectRole;
  estimateScale: EstimateScale;
  cyclesEnabled: boolean;
  triageEnabled: boolean;
  /** "owner/name" once connected. */
  githubRepo: string | null;
  workspaceId: string | null;
}

export interface ProjectLabel extends IssueLabel {
  description: string | null;
}

export interface ProjectMember extends IssueUser {
  role: ProjectRole;
}

export interface CycleSummary {
  id: string;
  number: number;
  name: string | null;
  startsAt: Date;
  endsAt: Date;
  completedAt: Date | null;
}

export type EpicStatus = 'backlog' | 'planned' | 'started' | 'paused' | 'completed' | 'canceled';

export interface MilestoneSummary {
  id: string;
  name: string;
}

export interface EpicSummary {
  id: string;
  name: string;
  color: string | null;
  status: EpicStatus;
  /** Ordered by sortOrder. */
  milestones: MilestoneSummary[];
}

export interface ProjectData {
  project: ProjectInfo;
  /** Sorted with sortStates (type order, then position). */
  states: WorkflowState[];
  /** Sorted by name. */
  labels: ProjectLabel[];
  /** Sorted by name. */
  members: ProjectMember[];
  /** Newest first. */
  cycles: CycleSummary[];
  /** Non-archived epics, by sortOrder. */
  epics: EpicSummary[];
  viewer: ProjectMember;
}
