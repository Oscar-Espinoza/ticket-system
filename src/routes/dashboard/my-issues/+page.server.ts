// My Issues — issues assigned to / created by / subscribed to by the viewer,
// plus the ones they recently acted on, across every project they belong to.
// Tabs are search params so each tab is one server query.
// (Port of src/app/dashboard/my-issues/page.tsx.)

import { redirect } from '@sveltejs/kit';

import { getProjectsForUser } from '@/lib/components/project-list.server';
import type { PageServerLoad } from './$types';
import {
  MY_ISSUES_TABS,
  getMyIssues,
  getMyRecentActivity,
  isMyIssuesTab,
  type MyIssuesTab,
} from './queries.server';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, '/login');
  const userId = locals.user.id;
  // Next handed repeated params over as an array (never a valid tab).
  const values = url.searchParams.getAll('tab');
  const raw = values.length > 1 ? values : values[0];
  const tab: MyIssuesTab = isMyIssuesTab(raw) ? raw : 'assigned';

  const [projects, content] = await Promise.all([
    getProjectsForUser(userId),
    tab === 'activity'
      ? getMyRecentActivity(userId).then((rows) => ({ kind: 'activity' as const, rows }))
      : getMyIssues(userId, tab).then((issues) => ({ kind: 'grouped' as const, issues })),
  ]);
  const projectNames: Record<string, string> = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  return {
    tab,
    tabs: MY_ISSUES_TABS.map((t) => ({
      id: t.id,
      label: t.label,
      href: t.id === 'assigned' ? '/dashboard/my-issues' : `/dashboard/my-issues?tab=${t.id}`,
    })),
    content,
    projectNames,
  };
};
