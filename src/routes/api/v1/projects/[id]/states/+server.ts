import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { workflowStates } from '@/db/schema';
import { sortStates } from '@/lib/workflow';
import { apiRoute, projectAccess } from '../../../_lib/api';

export const GET = apiRoute<{ id: string }>(async (_req, { userId }, { id }) => {
  const access = await projectAccess(userId, id, 'read');
  if (!access.ok) return access.response;

  const rows = await db
    .select({
      id: workflowStates.id,
      name: workflowStates.name,
      type: workflowStates.type,
      color: workflowStates.color,
      position: workflowStates.position,
      description: workflowStates.description,
    })
    .from(workflowStates)
    .where(eq(workflowStates.projectId, id));
  return Response.json({ states: sortStates(rows) });
});
