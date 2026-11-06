// Issue shape the editors suggest and link; returned by the suggestIssues action.
import type { WorkflowState } from '@/lib/issue-model';

export interface EditorIssue {
  id: string;
  /** "APP-12" */
  key: string;
  title: string;
  state?: Pick<WorkflowState, 'name' | 'type' | 'color'>;
}
