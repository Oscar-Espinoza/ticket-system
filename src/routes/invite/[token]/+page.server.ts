// Invite landing page. PUBLIC route
// (outside /dashboard); it resolves the session itself and renders one of four
// states:
//
//   invalid   — unknown / expired / already-used token: a generic message
//               (never a 404, which would confirm whether a token exists)
//   signed out — sign-in CTA returning here (/login?redirect=/invite/[token])
//   mismatch  — email invitation for a different address than the session's
//   ready     — "Join {project}" with the role; JoinProjectButton POSTs
//
// Visiting is read-only: joining is the explicit POST in joinProject.

import { and, eq, gt, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { invitations, projects, users } from '@/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { token } = params;

  const [invitation] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      projectName: projects.name,
      inviterName: users.name,
    })
    .from(invitations)
    .innerJoin(projects, eq(invitations.projectId, projects.id))
    .leftJoin(users, eq(invitations.invitedById, users.id))
    .where(
      and(
        eq(invitations.token, token),
        gt(invitations.expiresAt, new Date()),
        isNull(invitations.acceptedAt),
      ),
    )
    .limit(1);

  return {
    token,
    invitation: invitation ?? null,
    user: locals.user ? { email: locals.user.email } : null,
  };
};
