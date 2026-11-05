// Issue shape the editors suggest/link (shared by the React and Svelte editors
// and the suggestIssues server action). React-free on purpose.
import type { WorkflowState } from '@/lib/issue-model';

export interface EditorIssue {
  id: string;
  /** "APP-12" */
  key: string;
  title: string;
  state?: Pick<WorkflowState, 'name' | 'type' | 'color'>;
}
