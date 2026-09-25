import { asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, projects } from '@/db/schema';
import { apiRoute } from '../_lib/api';

/** Projects the key's user is a member of (the join is the authorization). */
export const GET = apiRoute(async (_req, { userId }) => {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      key: projects.ticketKey,
      description: projects.description,
      role: projectMembers.role,
      triageEnabled: projects.triageEnabled,
      createdAt: projects.createdAt,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, userId))
    .orderBy(asc(projects.name));
  return Response.json({ projects: rows });
});
