import { asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, users } from '@/db/schema';
import { apiRoute, projectAccess } from '../../../_lib/api';

export const GET = apiRoute<{ id: string }>(async (_req, { userId }, { id }) => {
  const access = await projectAccess(userId, id, 'read');
  if (!access.ok) return access.response;

  // Emails stay out: the API shouldn't be an address harvester for guests.
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      role: projectMembers.role,
      joinedAt: projectMembers.createdAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, id))
    .orderBy(asc(users.name));
  return Response.json({ members: rows });
});
