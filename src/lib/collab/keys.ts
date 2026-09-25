// Server-only: who may read / write a collaborative key. One query resolves the
// key's project and the viewer's role in it (the membership join is the
// authorization filter), so foreign or unknown keys are indistinguishable.

import { and, eq, isNull, sql } from 'drizzle-orm';

import { documents, projectMembers, tickets } from '@/db/schema';
import { db } from '@/lib/db';
import { roleAllows, type ProjectRole } from '@/lib/roles';
import { parseCollabKey, type CollabKind } from './codec';

export interface CollabAccess {
  kind: CollabKind;
  id: string;
  projectId: string;
  role: ProjectRole;
  canWrite: boolean;
}

export async function resolveCollabAccess(key: string, userId: string): Promise<CollabAccess | null> {
  const parsed = parseCollabKey(key);
  if (!parsed || !userId) return null;

  const rows =
    parsed.kind === 'doc'
      ? await db
          .select({ projectId: documents.projectId, role: projectMembers.role, archivedAt: documents.archivedAt })
          .from(documents)
          .innerJoin(
            projectMembers,
            and(eq(projectMembers.projectId, documents.projectId), eq(projectMembers.userId, userId)),
          )
          .where(eq(documents.id, parsed.id))
          .limit(1)
      : await db
          .select({ projectId: tickets.projectId, role: projectMembers.role, archivedAt: sql<null>`null` })
          .from(tickets)
          .innerJoin(
            projectMembers,
            and(eq(projectMembers.projectId, tickets.projectId), eq(projectMembers.userId, userId)),
          )
          .where(and(eq(tickets.id, parsed.id), isNull(tickets.deletedAt)))
          .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    ...parsed,
    projectId: row.projectId,
    role: row.role,
    // Archived docs are read-only until unarchived.
    canWrite: roleAllows(row.role, 'write') && !row.archivedAt,
  };
}
