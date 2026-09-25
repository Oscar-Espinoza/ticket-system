// Workspace initiatives. Workspace membership gates the page (non-members and
// unknown slugs get a 404); rolled-up progress only counts epics from projects
// the viewer is a member of.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { InitiativesList } from '@/components/initiatives/initiatives-list';
import { getWorkspaceInitiatives, getWorkspaceMemberUsers } from '@/lib/initiatives';
import { getSession } from '@/lib/session';
import { getWorkspaceMembership } from '@/lib/workspace-access';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [{ slug }, session] = await Promise.all([params, getSession()]);
  const membership = session?.user ? await getWorkspaceMembership(slug, session.user.id) : null;
  return { title: membership ? `Initiatives · ${membership.name}` : 'Workspace not found' };
}

export default async function InitiativesPage({ params }: { params: Params }) {
  const [{ slug }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const membership = await getWorkspaceMembership(slug, session.user.id);
  if (!membership) notFound();

  const [initiatives, members] = await Promise.all([
    getWorkspaceInitiatives(membership.workspaceId, session.user.id),
    getWorkspaceMemberUsers(membership.workspaceId),
  ]);

  return (
    <InitiativesList
      workspace={{ id: membership.workspaceId, slug: membership.slug, name: membership.name }}
      initiatives={initiatives}
      members={members}
      viewerId={session.user.id}
    />
  );
}
