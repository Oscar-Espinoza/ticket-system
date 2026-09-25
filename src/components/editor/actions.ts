'use server';

// `#` / KEY- issue suggestions for editors that weren't handed an issue list
// (comments, epics, docs). Project-scoped and membership-checked.

import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';

import { projects, tickets, workflowStates } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { db } from '@/lib/db';
import type { EditorIssue } from './context';

const LIMIT = 8;

export async function suggestIssues(input: { projectId: unknown; query: unknown }): Promise<EditorIssue[]> {
  const authz = await authorizeProjectAction(input.projectId, 'read');
  if (!authz.ok) return [];
  const projectId = input.projectId as string;
  const query = typeof input.query === 'string' ? input.query.trim().slice(0, 80) : '';

  const scope = and(eq(tickets.projectId, projectId), isNull(tickets.deletedAt), isNull(tickets.archivedAt));
  // "12" or "APP-12" (the key is implied by the project).
  const digits = /^(?:[A-Za-z][A-Za-z0-9]*-)?(\d{1,9})$/.exec(query)?.[1];
  const number = digits ? Number(digits) : null;
  // LIKE wildcards in the query are literal text.
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const match = query
    ? number !== null
      ? or(eq(tickets.ticketNumber, number), ilike(tickets.title, pattern))
      : ilike(tickets.title, pattern)
    : undefined;

  const rows = await db
    .select({
      id: tickets.id,
      number: tickets.ticketNumber,
      ticketKey: projects.ticketKey,
      title: tickets.title,
      state: { name: workflowStates.name, type: workflowStates.type, color: workflowStates.color },
    })
    .from(tickets)
    .innerJoin(projects, eq(tickets.projectId, projects.id))
    .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
    .where(match ? and(scope, match) : scope)
    .orderBy(desc(tickets.updatedAt))
    .limit(LIMIT);

  return rows.map(({ number: n, ticketKey, ...row }) => ({ ...row, key: `${ticketKey}-${n}` }));
}
