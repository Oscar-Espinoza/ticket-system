import { projectStatesQuery } from '@/lib/workflow-server';
import { sortStates } from '@/lib/workflow';
import { apiRoute, projectAccess } from '../../../_lib/api';
import { allowOptions } from '../../../../_lib/options';

export const GET = apiRoute<{ id: string }>(async (_req, { userId }, { id }) => {
  const access = await projectAccess(userId, id, 'read');
  if (!access.ok) return access.response;

  const rows = await projectStatesQuery(id);
  return Response.json({ states: sortStates(rows) });
});

// Next answered OPTIONS automatically (204 + Allow); Kit would 405.
export const OPTIONS = allowOptions('GET');
