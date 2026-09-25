// Initiative shapes and constants (client-safe; shared by reads, actions and UI).

import type { IssueUser } from '@/lib/issue-model';
import type { EpicRow, MilestoneRow, Progress } from '@/components/epics/epic-model';

export const INITIATIVE_STATUSES = ['planned', 'active', 'completed'] as const;
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];

export const INITIATIVE_STATUS_LABEL: Record<InitiativeStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  completed: 'Completed',
};

export function isInitiativeStatus(value: unknown): value is InitiativeStatus {
  return typeof value === 'string' && (INITIATIVE_STATUSES as readonly string[]).includes(value);
}

/** Unknown stored values read as "planned". */
export const toInitiativeStatus = (value: string): InitiativeStatus =>
  isInitiativeStatus(value) ? value : 'planned';

export const INITIATIVE_NAME_MAX = 80;

export interface InitiativeRow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: InitiativeStatus;
  owner: IssueUser | null;
  /** YYYY-MM-DD */
  targetDate: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Linked, non-archived epics the viewer can see. */
  epicCount: number;
  progress: Progress;
}

export interface InitiativeEpic extends EpicRow {
  projectName: string;
  projectKey: string;
  /** The viewer may relink it (write level in its project). */
  canEdit: boolean;
}

export interface CandidateEpic {
  id: string;
  name: string;
  color: string | null;
  projectId: string;
  projectKey: string;
  /** Currently linked elsewhere (moving it relinks). */
  initiativeId: string | null;
}

export interface InitiativeDetail {
  initiative: InitiativeRow;
  epics: InitiativeEpic[];
  milestones: MilestoneRow[];
  /** Epics of the workspace's projects the viewer can edit, not linked here. */
  candidates: CandidateEpic[];
  members: IssueUser[];
}

export const initiativesPath = (slug: string, initiativeId?: string) =>
  `/dashboard/workspaces/${slug}/initiatives${initiativeId ? `/${initiativeId}` : ''}`;
