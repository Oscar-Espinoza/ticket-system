// Roadmap: the
// project's non-archived epics on a timeline. The project layout authorized
// the viewer; getProjectEpics is membership-gated in SQL too.

import { getProjectEpics } from '@/lib/epics';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const user = await requireUser();
  const { epics, milestones, dependencies } = await getProjectEpics(params.id, user.id);
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
