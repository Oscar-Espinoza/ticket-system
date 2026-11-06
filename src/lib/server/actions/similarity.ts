// Similar-issue lookups (read level) for duplicate hints: the new-issue dialog
// and the issue detail's "Similar issues" section. Advisory only — callers
// treat any error as "no hints".

import { authorizeProjectAction } from '@/lib/action-auth';
import { fail } from '@/lib/server/action-kit';
import { findSimilarIssues, readSimilarIssues, type SimilarResult } from '@/lib/similarity';

export type { SimilarResult };

/** Title typed in the new-issue dialog → up to 3 possible duplicates. */
export async function findPossibleDuplicates(input: {
  projectId: string;
  title: string;
  description?: string;
}): Promise<SimilarResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  if (typeof input.title !== 'string') return fail('Invalid title.');
  const similar = await findSimilarIssues(authz.userId, input.projectId, {
    title: input.title,
    description: typeof input.description === 'string' ? input.description : null,
    limit: 3,
  });
  return { ok: true, similar };
}

/**
 * Issues similar to an existing one, minus the ones already tied to it
 * (relations in either direction, its parent and its sub-issues).
 */
export async function getSimilarIssues(input: {
  projectId: string;
  ticketId: string;
}): Promise<SimilarResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  return readSimilarIssues(authz.userId, input.projectId, input.ticketId);
}
