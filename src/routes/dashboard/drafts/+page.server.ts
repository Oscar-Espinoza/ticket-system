// Drafts — the viewer's unfinished new issues across projects. Joined with
// project_member so drafts in projects the viewer has left drop out.

import { redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { issueDrafts, projectMembers, projects } from '@/db/schema';
import { getSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');

  const drafts = await db
    .select({
      id: issueDrafts.id,
      title: issueDrafts.title,
      description: issueDrafts.description,
      updatedAt: issueDrafts.updatedAt,
      projectId: issueDrafts.projectId,
      projectName: projects.name,
      ticketKey: projects.ticketKey,
    })
    .from(issueDrafts)
    .innerJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, issueDrafts.projectId),
        eq(projectMembers.userId, issueDrafts.userId),
      ),
    )
    .innerJoin(projects, eq(projects.id, issueDrafts.projectId))
    .where(eq(issueDrafts.userId, session.user.id))
    .orderBy(desc(issueDrafts.updatedAt))
    .limit(200);

  return { drafts };
};
