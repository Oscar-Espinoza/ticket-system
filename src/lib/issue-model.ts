import type { TicketStatus } from '@/components/ui-icons';

export type { TicketStatus };

export interface IssueAssignee {
  id: string;
  name: string;
  image: string | null;
}

// C5: the one issue shape the list, board and detail pane all consume.
export interface IssueRow {
  id: string;
  key: string;
  number: number;
  title: string;
  description: string | null;
  status: TicketStatus;
  assignee: IssueAssignee | null;
  githubBranch: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
};

export const STATUS_ORDER = Object.keys(STATUS_LABEL) as TicketStatus[];

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && Object.hasOwn(STATUS_LABEL, value);
}

export interface IssueGroup {
  status: TicketStatus;
  label: string;
  issues: IssueRow[];
}

export function groupByStatus(issues: IssueRow[]): IssueGroup[] {
  return STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABEL[status],
    issues: issues.filter((issue) => issue.status === status),
  }));
}

export const UNASSIGNED = 'unassigned';

export interface IssueFilters {
  statuses: TicketStatus[];
  /** A member's user id, UNASSIGNED, or null for "anyone". */
  assignee: string | null;
}

type SearchParamValue = string | string[] | undefined;

function first(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseIssueFilters(params: {
  status?: SearchParamValue;
  assignee?: SearchParamValue;
}): IssueFilters {
  const statuses = (first(params.status) ?? '')
    .split(',')
    .filter(isTicketStatus);
  const assignee = first(params.assignee)?.trim() || null;
  return { statuses: [...new Set(statuses)], assignee };
}
