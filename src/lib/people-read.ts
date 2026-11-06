// Reads behind the member profile page (server only). NO AUTHORIZATION here:
// the caller decides who may see the profile and passes the project ids they
// share.

import { and, desc, eq, inArray } from 'drizzle-orm';

import { activities, projects, tickets, userProfiles, users } from '@/db/schema';
import { db } from '@/lib/db';

export async function getPerson(userId: string) {
  const [person] = await db
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
    .limit(1);
  return person;
}

/** The person's latest activity in the given projects. */
export function getRecentActivity(actorId: string, projectIds: string[]) {
  return db
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
    .where(and(eq(activities.actorId, actorId), inArray(activities.projectId, projectIds)))
    .orderBy(desc(activities.createdAt))
    .limit(20);
}
