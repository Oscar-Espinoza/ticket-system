import { asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { labels } from '@/db/schema';
import { apiRoute, projectAccess } from '../../../_lib/api';

export const GET = apiRoute<{ id: string }>(async (_req, { userId }, { id }) => {
  const access = await projectAccess(userId, id, 'read');
  if (!access.ok) return access.response;

  const rows = await db
    .select({
      id: labels.id,
      name: labels.name,
      color: labels.color,
      description: labels.description,
    })
    .from(labels)
    .where(eq(labels.projectId, id))
    .orderBy(asc(labels.name));
  return Response.json({ labels: rows });
});
