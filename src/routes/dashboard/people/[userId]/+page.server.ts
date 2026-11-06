// Member profile. Visible
// to the person themselves and to anyone who shares at least one project with
// them; everyone else gets a 404 (no probing user ids). Everything shown —
// projects, assigned issues, activity — is limited to projects the viewer is a
// member of.

import { error } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { activities, projects, tickets, userProfiles, users } from '@/db/schema';
import { openStateType } from '@/lib/workflow-server';
import { getSharedProjects } from '@/lib/project-access';
import { activeIssue, memberOfIssueProject, queryIssues } from '@/lib/tickets';
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

  const [[person], recent, assigned] = await Promise.all([
    db
      .select({
        name: users.name,
        email: users.email,
        image: users.image,
        title: userProfiles.title,
        bio: userProfiles.bio,
        timezone: userProfiles.timezone,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1),
    sharedIds.length === 0
      ? []
      : db
          .select({
            id: activities.id,
            type: activities.type,
            data: activities.data,
            createdAt: activities.createdAt,
            ticketId: activities.ticketId,
            projectId: activities.projectId,
            projectName: projects.name,
            ticketKey: projects.ticketKey,
            number: tickets.ticketNumber,
            title: tickets.title,
            deletedAt: tickets.deletedAt,
          })
          .from(activities)
          .innerJoin(projects, eq(activities.projectId, projects.id))
          .leftJoin(tickets, eq(activities.ticketId, tickets.id))
          .where(and(eq(activities.actorId, userId), inArray(activities.projectId, sharedIds)))
          .orderBy(desc(activities.createdAt))
          .limit(20),
    queryIssues(
      and(
        eq(tickets.assigneeId, userId),
        memberOfIssueProject(viewerId),
        activeIssue(),
        openStateType(),
      ),
      { limit: 50, orderBy: [desc(tickets.updatedAt)] },
    ),
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
