// Member profile. Visible
// to the person themselves and to anyone who shares at least one project with
// them; everyone else gets a 404 (no probing user ids). Everything shown —
// projects, assigned issues, activity — is limited to projects the viewer is a
// member of.

import { error } from '@sveltejs/kit';
import { getAssignedOpenIssues } from '@/lib/issue-lists-read';
import { getPerson, getRecentActivity } from '@/lib/people-read';
import { ELSEWHERE_ACTIVITY_TYPE, redactActivityFor } from '@/lib/moved-events';
import { getSharedProjects } from '@/lib/project-access';
import { activitySummary } from '@/lib/components/people/activity-summary';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

/** Relative to the server's request time (the page renders per request). */
function ago(date: Date, now = Date.now()): string {
  const minutes = Math.round((date.getTime() - now) / 60_000);
  if (Math.abs(minutes) < 60) return minutes === 0 ? 'just now' : rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return rtf.format(days, 'day');
  return dateFormat.format(date);
}

export const load: PageServerLoad = async ({ params }) => {
  const { userId } = params;
  const user = await requireUser();
  const viewerId = user.id;
  const shared = await getSharedProjects(viewerId, userId);
  if (viewerId !== userId && shared.length === 0) error(404, 'Profile not found');

  const isSelf = viewerId === userId;
  const sharedIds = shared.map((project) => project.id);

  const [person, recent, assigned] = await Promise.all([
    getPerson(userId),
    sharedIds.length === 0 ? [] : getRecentActivity(userId, sharedIds)
          .then((rows) => redactActivityFor(rows, viewerId))
          // A collapsed row would still say this person was active on the
          // issue then, in a project the viewer cannot see: leave it out.
          .then((rows) => rows.filter((row) => row.type !== ELSEWHERE_ACTIVITY_TYPE)),
    getAssignedOpenIssues(userId, viewerId),
  ]);
  if (!person) error(404, 'Profile not found');

  const projectNames = new Map(shared.map((project) => [project.id, project.name]));
  const now = Date.now();

  return {
    isSelf,
    person,
    shared: shared.map((project) => ({
      id: project.id,
      name: project.name,
      ticketKey: project.ticketKey,
      role: project.role,
    })),
    // Only what the rows render (IssueRow carries much more).
    assigned: assigned.map((issue) => ({
      id: issue.id,
      projectId: issue.projectId,
      key: issue.key,
      title: issue.title,
      priority: issue.priority,
      state: { type: issue.state.type, color: issue.state.color, name: issue.state.name },
      projectName: projectNames.get(issue.projectId) ?? null,
    })),
    recent: recent.map((item) => {
      const data = item.data ?? {};
      const key =
        item.number !== null
          ? `${item.ticketKey}-${item.number}`
          : typeof data.key === 'string'
            ? data.key
            : null;
      const title = item.title ?? (typeof data.title === 'string' ? data.title : null);
      const linkable = item.ticketId !== null && item.number !== null && !item.deletedAt;
      return {
        id: item.id,
        summary: activitySummary(item.type, data),
        key,
        title,
        linkable,
        projectId: item.projectId,
        projectName: projectNames.get(item.projectId) ?? item.projectName,
        createdAt: item.createdAt.toISOString(),
        ago: ago(item.createdAt, now),
      };
    }),
  };
};
