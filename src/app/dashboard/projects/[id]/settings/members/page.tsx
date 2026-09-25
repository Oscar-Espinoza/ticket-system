// Project settings › Members: roster with roles for everyone; invitations
// (email + shareable link) for owners and admins.
//
// Security: getMemberProject (membership inner join) runs before any other
// project-scoped read; non-members get notFound() so outsiders can't probe
// project ids. Every invite/member action re-checks the role server-side.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { db } from '@/lib/db';
import { invitations, projectMembers, users } from '@/db/schema';
import { roleAllows } from '@/lib/roles';
import { Separator } from '@/components/ui/separator';
import { InvitePanel } from '@/components/invite-panel';
import { MemberList } from '@/components/member-list';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  const project = session?.user ? await getMemberProject(id, session.user.id) : null;
  return { title: project ? `Members · ${project.name}` : 'Project not found' };
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');

  const project = await getMemberProject(id, session.user.id);
  if (!project) notFound();
  const canInvite = roleAllows(project.role, 'admin');

  const [roster, invites] = await Promise.all([
    db
      .select({
        id: projectMembers.id,
        userId: projectMembers.userId,
        name: users.name,
        email: users.email,
        image: users.image,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, id)),
    canInvite
      ? db
          .select({
            id: invitations.id,
            token: invitations.token,
            email: invitations.email,
            role: invitations.role,
            expiresAt: invitations.expiresAt,
            invitedByName: users.name,
          })
          .from(invitations)
          .leftJoin(users, eq(invitations.invitedById, users.id))
          .where(and(eq(invitations.projectId, id), isNull(invitations.acceptedAt)))
          .orderBy(asc(invitations.createdAt))
      : [],
  ]);

  const link = invites.find((invite) => invite.email === null);
  const pending = invites.flatMap((invite) =>
    invite.email === null
      ? []
      : [
          {
            id: invite.id,
            email: invite.email,
            role: invite.role,
            expiresAt: invite.expiresAt.toISOString(),
            url: `${appUrl}/invite/${invite.token}`,
            invitedByName: invite.invitedByName,
          },
        ],
  );

  return (
    <>
      <h1 className="text-xl font-medium">Members</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        People who can see and work on this project. Admins manage settings and
        members; guests can only view and comment.
      </p>

      {canInvite && (
        <>
          <InvitePanel
            projectId={id}
            inviteUrl={link ? `${appUrl}/invite/${link.token}` : null}
            pending={pending}
          />
          <Separator className="my-8" />
        </>
      )}

      <section>
        <h2 className="mb-3 text-base font-medium">
          Team members <span className="text-muted-foreground">· {roster.length}</span>
        </h2>
        <MemberList members={roster} currentUserId={session.user.id} projectId={id} />
      </section>
    </>
  );
}

