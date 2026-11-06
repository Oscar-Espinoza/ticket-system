import type { WorkspaceProjectRow } from '@/lib/workspace-types';

/** The page's rows plus the team-structure columns (optional until it passes them). */
export type WorkspaceTeamRow = WorkspaceProjectRow & {
  parentId?: string | null;
  visibility?: string;
};
