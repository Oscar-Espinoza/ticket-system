// Group issues for the list, board and (later) table views. Each group carries
// the patch that puts an issue INTO it, so dropping a card on a column or
// creating from a group's "+" is just mutations.update / create with it.
//
// Implemented: 'state', 'none'. B5 implements the rest behind the same shape.

import type { IssuePatch, IssueRow, WorkflowState } from '@/lib/issue-model';
import type { ProjectData } from '@/lib/project-data-types';

export type GroupBy = 'state' | 'assignee' | 'priority' | 'label' | 'cycle' | 'epic' | 'none';

export interface IssueGroup {
  /** Stable within a grouping: state id, user id, 'none', … */
  id: string;
  label: string;
  kind: GroupBy;
  /** Set for kind 'state' (glyph + color in headers). */
  state?: WorkflowState;
  /** Accent color for the header (hex). */
  color?: string;
  /** Applied when an issue is dropped / created in this group; null = not droppable. */
  patch: IssuePatch | null;
  /** In input order — sort before grouping. */
  issues: IssueRow[];
}

export type GroupingData = Pick<ProjectData, 'states'> & {
  project: Pick<ProjectData['project'], 'triageEnabled'>;
};

function byState(issues: IssueRow[], data: GroupingData): IssueGroup[] {
  const buckets = new Map<string, IssueRow[]>(data.states.map((s) => [s.id, []]));
  for (const issue of issues) buckets.get(issue.stateId)?.push(issue);
  return data.states
    .map((state) => ({
      id: state.id,
      label: state.name,
      kind: 'state' as const,
      state,
      color: state.color,
      patch: { stateId: state.id },
      issues: buckets.get(state.id) ?? [],
    }))
    .filter((group) => group.state.type !== 'triage' || data.project.triageEnabled || group.issues.length > 0);
}

/**
 * Every group, empty ones included (the board needs every column as a drop
 * target); lists drop empty groups unless DisplayOptions.showEmptyGroups.
 */
export function groupIssues(issues: IssueRow[], groupBy: GroupBy, data: GroupingData): IssueGroup[] {
  switch (groupBy) {
    case 'state':
      return byState(issues, data);
    default:
      // Not implemented yet (B5): everything in one group.
      return [{ id: 'all', label: 'All issues', kind: 'none', patch: null, issues }];
  }
}
