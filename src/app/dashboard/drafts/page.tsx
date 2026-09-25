// Drafts — the viewer's unfinished new issues across projects. Joined with
// project_member so drafts in projects the viewer has left drop out.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';

import { DraftsList } from '@/components/productivity/drafts-list';
import { db } from '@/lib/db';
import { issueDrafts, projectMembers, projects } from '@/db/schema';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Drafts' };

export default async function DraftsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

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

  return <DraftsList drafts={drafts} />;
}
