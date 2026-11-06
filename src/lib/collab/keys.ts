// Server-only: who may read / write a collaborative key. One query resolves the
// key's project and the viewer's role in it (the membership join is the
// authorization filter), so foreign or unknown keys are indistinguishable.

import { and, eq, isNull } from 'drizzle-orm';

import { projectMembers, tickets } from '@/db/schema';
import { db } from '@/lib/db';
import { getDocumentAccess } from '@/lib/documents';
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

  if (parsed.kind === 'doc') {
    const access = await getDocumentAccess(parsed.id, userId);
    if (!access) return null;
    return { ...parsed, projectId: access.projectId, role: access.role, canWrite: access.canEdit };
  }

  const [row] = await db
    .select({ projectId: tickets.projectId, role: projectMembers.role })
    .from(tickets)
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, tickets.projectId), eq(projectMembers.userId, userId)),
    )
    .where(and(eq(tickets.id, parsed.id), isNull(tickets.deletedAt)))
    .limit(1);
  if (!row) return null;
  return { ...parsed, projectId: row.projectId, role: row.role, canWrite: roleAllows(row.role, 'write') };
}
