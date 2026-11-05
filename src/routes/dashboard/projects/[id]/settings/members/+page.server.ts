// Project settings › Members: roster with roles for everyone; invitations
// (email + shareable link) for owners and admins.
//
// Security: getMemberProject (membership inner join) runs before any other
// project-scoped read; non-members get a 404 so outsiders can't probe
// project ids. Every invite/member action re-checks the role server-side.

import { error, redirect } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { invitations, projectMembers, users } from '@/db/schema';
import { db } from '@/lib/db';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id } = params;
  if (!locals.user) redirect(303, '/login');
  const appUrl = process.env.PUBLIC_APP_URL ?? '';

  const project = await getMemberProject(id, locals.user.id);
  if (!project) error(404, 'Not found');
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

  return {
    projectId: id,
    projectName: project.name,
    currentUserId: locals.user.id,
    canInvite,
    inviteUrl: link ? `${appUrl}/invite/${link.token}` : null,
    pending,
    roster,
  };
};
