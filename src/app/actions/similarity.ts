'use server';

// Similar-issue lookups (read level) for duplicate hints: the new-issue dialog
// and the issue detail's "Similar issues" section. Advisory only — callers
// treat any error as "no hints".

import { eq, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { issueRelations, tickets } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { stripMentions } from '@/lib/mentions';
import { findSimilarIssues, type SimilarIssue } from '@/lib/similarity';
import { getTicketById } from '@/lib/tickets';

export type SimilarResult = { ok: true; similar: SimilarIssue[] } | { ok: false; error: string };

/** Title typed in the new-issue dialog → up to 3 possible duplicates. */
export async function findPossibleDuplicates(input: {
  projectId: string;
  title: string;
  description?: string;
}): Promise<SimilarResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  if (typeof input.title !== 'string') return { ok: false, error: 'Invalid title.' };
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
  if (typeof input.ticketId !== 'string' || !input.ticketId) {
    return { ok: false, error: 'Issue not found.' };
  }
  const issue = await getTicketById(input.projectId, input.ticketId);
  if (!issue || issue.deletedAt) return { ok: false, error: 'Issue not found.' };

  const [relations, children] = await db.batch([
    db
      .select({ a: issueRelations.ticketId, b: issueRelations.relatedTicketId })
      .from(issueRelations)
      .where(or(eq(issueRelations.ticketId, issue.id), eq(issueRelations.relatedTicketId, issue.id))),
    db.select({ id: tickets.id }).from(tickets).where(eq(tickets.parentId, issue.id)),
  ]);
  const exclude = new Set<string>([issue.id, ...children.map((c) => c.id)]);
  if (issue.parentId) exclude.add(issue.parentId);
  for (const r of relations) exclude.add(r.a).add(r.b);

  const similar = await findSimilarIssues(authz.userId, input.projectId, {
    title: issue.title,
    description: issue.description ? stripMentions(issue.description) : null,
    excludeIds: [...exclude],
    limit: 5,
  });
  return { ok: true, similar };
}
