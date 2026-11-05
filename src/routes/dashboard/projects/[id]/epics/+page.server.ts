// Epics list (port of src/app/dashboard/projects/[id]/epics/page.tsx). The
// project layout already authorized the viewer; getProjectEpics is
// membership-gated in SQL too.

import { redirect } from '@sveltejs/kit';

import { getProjectEpics } from '@/lib/epics';
import { getSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  const { epics, labels } = await getProjectEpics(params.id, session.user.id);
  return { epics, labels };
};
