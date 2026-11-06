// Epics list. The project layout already authorized the viewer; getProjectEpics is
// membership-gated in SQL too.

import { getProjectEpics } from '@/lib/epics';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const user = await requireUser();
  const { epics, labels } = await getProjectEpics(params.id, user.id);
  return { epics, labels };
};
