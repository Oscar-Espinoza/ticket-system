// The slice of a project the pull request automation needs, shared by every
// provider's webhook: its id, its issue key prefix and its PR automation
// settings (Settings → GitHub).

import { projects } from '@/db/schema';

export interface VcsProject {
  id: string;
  ticketKey: string;
  prOpenStateId: string | null;
  prMergeStateId: string | null;
}

/** Select these from `projects` to get a `VcsProject`. */
export const vcsProjectColumns = {
  id: projects.id,
  ticketKey: projects.ticketKey,
  prOpenStateId: projects.githubPrOpenStateId,
  prMergeStateId: projects.githubPrMergeStateId,
};
