// Project settings › Members: roster with roles for everyone; invitations
// (email + shareable link) for owners and admins.
//
// Non-members get a 404 (loadViewerProject) before any other project-scoped
// read, so outsiders can't probe project ids. Every invite/member action
// re-checks the role server-side.

import { and, asc, eq, isNull } from 'drizzle-orm';

import { invitations, projectMembers, users } from '@/db/schema';
import { db } from '@/lib/db';
import { appUrl } from '@/lib/integrations/app-url';
import { roleAllows } from '@/lib/roles';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const { user, project } = await loadViewerProject(id);
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
            url: `${appUrl()}/invite/${invite.token}`,
            invitedByName: invite.invitedByName,
          },
        ],
  );

  return {
    projectId: id,
    projectName: project.name,
    currentUserId: user.id,
    canInvite,
    inviteUrl: link ? `${appUrl()}/invite/${link.token}` : null,
    pending,
    roster,
  };
};
