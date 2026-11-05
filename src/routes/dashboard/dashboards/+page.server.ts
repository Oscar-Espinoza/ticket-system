// Dashboards (yours + shared into your projects) and the Pulse tab: the epic
// update feed and this week's numbers across your projects.
// (port of src/app/dashboard/dashboards/page.tsx)

import { redirect } from '@sveltejs/kit';

import { getProjectsForUser } from '@/lib/components/project-list.server';
import { getVisibleDashboards } from '@/lib/dashboards';
import { getPulseFeed } from '@/lib/pulse';
import { getSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

const PULSE_DAYS = 30;

export const load: PageServerLoad = async ({ url }) => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  const userId = session.user.id;
  const pulse = url.searchParams.get('tab') === 'pulse';
  const [projects, dashboards, feed] = await Promise.all([
    pulse ? [] : getProjectsForUser(userId),
    pulse ? [] : getVisibleDashboards(userId),
    pulse ? getPulseFeed(userId, PULSE_DAYS) : null,
  ]);

  return {
    pulse,
    days: PULSE_DAYS,
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    dashboards,
    feed,
  };
};
