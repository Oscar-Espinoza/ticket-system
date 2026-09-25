// Initiative detail. Workspace membership gates the page; the initiative must
// belong to that workspace (404 otherwise). Linked epics are limited to
// projects the viewer is a member of.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { InitiativeDetail } from '@/components/initiatives/initiative-detail';
import { getInitiativeDetail } from '@/lib/initiatives';
import { getSession } from '@/lib/session';
import { getWorkspaceMembership } from '@/lib/workspace-access';

type Params = Promise<{ slug: string; initiativeId: string }>;

async function load(params: Params) {
  const [{ slug, initiativeId }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) return { session: null, membership: null, detail: null };
  const membership = await getWorkspaceMembership(slug, session.user.id);
  const detail = membership
    ? await getInitiativeDetail(membership.workspaceId, initiativeId, session.user.id)
    : null;
  return { session, membership, detail };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { detail } = await load(params);
  return { title: detail ? detail.initiative.name : 'Initiative not found' };
}

export default async function InitiativePage({ params }: { params: Params }) {
  const { session, membership, detail } = await load(params);
  if (!session?.user) redirect('/login');
  if (!membership || !detail) notFound();

  const canDelete =
    membership.role !== 'member' || detail.initiative.owner?.id === session.user.id;

  return (
    <InitiativeDetail
      workspace={{ id: membership.workspaceId, slug: membership.slug, name: membership.name }}
      detail={detail}
      viewerId={session.user.id}
      canDelete={canDelete}
    />
  );
}
