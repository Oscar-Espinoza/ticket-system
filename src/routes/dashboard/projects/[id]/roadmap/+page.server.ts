// Roadmap (port of src/app/dashboard/projects/[id]/roadmap/page.tsx): the
// project's non-archived epics on a timeline. The project layout authorized
// the viewer; getProjectEpics is membership-gated in SQL too.

import { redirect } from '@sveltejs/kit';

import { getProjectEpics } from '@/lib/epics';
import { getSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  const { epics, milestones, dependencies } = await getProjectEpics(params.id, session.user.id);
  const active = epics.filter((epic) => !epic.archivedAt);
  const activeIds = new Set(active.map((epic) => epic.id));
  return {
    epics: active,
    milestones: milestones.filter((milestone) => activeIds.has(milestone.epicId)),
    dependencies: dependencies.filter(
      (dep) => activeIds.has(dep.blockerId) && activeIds.has(dep.blockedId),
    ),
  };
};
