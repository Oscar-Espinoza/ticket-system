// Project invitations (owner/admin):
//   - one reusable shareable link per project (`email IS NULL`, role member,
//     30 days), replaced on regenerate — generateInviteLink keeps its
//     useActionState signature.
//   - per-person email invitations (`email` set, chosen role, 7 days, single
//     use — see join.ts), with resend and revoke.
// Roles an actor may hand out come from @/lib/roles (admins can't mint admins).
// Tokens are 32 random bytes, base64url (256-bit, URL-safe).
// neon-http: no interactive transactions — replacements use db.batch.

import { randomBytes } from 'node:crypto';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { invitations, projectMembers, projects, users } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { isUniqueViolation } from '@/lib/db-errors';
import { sendEmail } from '@/lib/email';
import { appUrl } from '@/lib/integrations/app-url';
import { DAY_MS, WEEK_MS } from '@/lib/time';
import {
  emailAddress,
  fail,
  FORBIDDEN,
  formField,
  isFail,
  refreshesData,
  type ActionResult,
} from '@/lib/server/action-kit';
import { assignableRoles, isAssignableRole, PROJECT_ROLE_LABEL } from '@/lib/roles';

export type GenerateInviteState = {
  errors?: {
    server?: string;
  };
  success?: boolean;
  url?: string;
};

export type InviteActionResult = ActionResult<{ url?: string; emailed?: boolean }, 'email' | 'role'>;

const LINK_TTL_MS = 30 * DAY_MS;
const EMAIL_TTL_MS = WEEK_MS;

const newToken = () => randomBytes(32).toString('base64url');
const inviteUrl = (token: string) => `${appUrl()}/invite/${token}`;

export async function generateInviteLink(
  _prevState: GenerateInviteState | Record<string, never>,
  formData: FormData,
): Promise<GenerateInviteState> {
  const projectId = formField(formData, 'projectId');
  if (!projectId) return { errors: { server: 'Project ID is required.' } };

  const authz = await authorizeProjectAction(projectId, 'admin');
  if (!authz.ok) return { errors: { server: authz.error } };

  const token = newToken();
  // Replace only the shareable link — email invitations are separate rows.
  try {
    await db.batch([
      db
        .delete(invitations)
        .where(and(eq(invitations.projectId, projectId), isNull(invitations.email))),
      db.insert(invitations).values({
        id: crypto.randomUUID(),
        projectId,
        token,
        role: 'member',
        invitedById: authz.userId,
        expiresAt: new Date(Date.now() + LINK_TTL_MS),
        createdAt: new Date(),
      }),
    ]);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      return { errors: { server: 'Could not generate link, try again.' } };
    }
    throw err;
  }

  refreshesData();
  return { success: true, url: inviteUrl(token) };
}

async function sendInviteEmail(opts: {
  to: string;
  projectId: string;
  inviterId: string;
  role: 'admin' | 'member' | 'guest';
  token: string;
}): Promise<boolean> {
  const [[project], [inviter]] = await Promise.all([
    db.select({ name: projects.name }).from(projects).where(eq(projects.id, opts.projectId)).limit(1),
    db.select({ name: users.name }).from(users).where(eq(users.id, opts.inviterId)).limit(1),
  ]);
  const projectName = project?.name ?? 'a project';
  const inviterName = inviter?.name ?? 'A teammate';
  const url = inviteUrl(opts.token);
  const role = PROJECT_ROLE_LABEL[opts.role].toLowerCase();
  const text = [
    `${inviterName} invited you to join ${projectName} as ${role === 'admin' ? 'an' : 'a'} ${role}.`,
    '',
    `Accept the invitation: ${url}`,
    '',
    `Sign in (or sign up) with ${opts.to} to accept. The link expires in 7 days.`,
  ].join('\n');
  return sendEmail({
    to: opts.to,
    subject: `${inviterName} invited you to ${projectName}`,
    text,
  });
}

export async function inviteByEmail(input: {
  projectId: string;
  email: string;
  role: string;
}): Promise<InviteActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;

  const email = emailAddress(input.email);
  if (isFail(email)) return email;
  const role = input.role;
  if (!isAssignableRole(role) || !assignableRoles(authz.role).includes(role)) {
    return fail('You can’t invite people with that role.', 'role');
  }

  const [existing] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(
      and(eq(projectMembers.projectId, input.projectId), sql`lower(${users.email}) = ${email}`),
    )
    .limit(1);
  if (existing) {
    return fail('This person is already a member.', 'email');
  }

  const token = newToken();
  const now = new Date();
  // Re-inviting a pending address replaces its row (fresh token and expiry).
  try {
    await db.batch([
      db
        .delete(invitations)
        .where(
          and(
            eq(invitations.projectId, input.projectId),
            eq(invitations.email, email),
            isNull(invitations.acceptedAt),
          ),
        ),
      db.insert(invitations).values({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        token,
        email,
        role,
        invitedById: authz.userId,
        expiresAt: new Date(now.getTime() + EMAIL_TTL_MS),
        createdAt: now,
      }),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) return fail('Could not create the invitation, try again.');
    throw err;
  }

  const emailed = await sendInviteEmail({
    to: email,
    projectId: input.projectId,
    inviterId: authz.userId,
    role,
    token,
  });
  refreshesData();
  return { ok: true, emailed, url: inviteUrl(token) };
}

async function loadPendingInvitation(projectId: string, invitationId: unknown) {
  if (typeof invitationId !== 'string' || !invitationId) return null;
  const [row] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      token: invitations.token,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.projectId, projectId),
        isNotNull(invitations.email),
        isNull(invitations.acceptedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** New 7-day expiry (same token, so earlier emails keep working) + a fresh email. */
export async function resendInvitation(input: {
  projectId: string;
  invitationId: string;
}): Promise<InviteActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;

  const invitation = await loadPendingInvitation(input.projectId, input.invitationId);
  if (!invitation?.email) return fail('Invitation not found.');
  if (!assignableRoles(authz.role).includes(invitation.role)) {
    return FORBIDDEN;
  }

  await db
    .update(invitations)
    .set({ expiresAt: new Date(Date.now() + EMAIL_TTL_MS), invitedById: authz.userId })
    .where(and(eq(invitations.id, invitation.id), eq(invitations.projectId, input.projectId)));

  const emailed = await sendInviteEmail({
    to: invitation.email,
    projectId: input.projectId,
    inviterId: authz.userId,
    role: invitation.role,
    token: invitation.token,
  });
  refreshesData();
  return { ok: true, emailed, url: inviteUrl(invitation.token) };
}

export async function revokeInvitation(input: {
  projectId: string;
  invitationId: string;
}): Promise<InviteActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;

  const invitation = await loadPendingInvitation(input.projectId, input.invitationId);
  if (!invitation) return fail('Invitation not found.');
  if (!assignableRoles(authz.role).includes(invitation.role)) {
    return FORBIDDEN;
  }

  await db
    .delete(invitations)
    .where(and(eq(invitations.id, invitation.id), eq(invitations.projectId, input.projectId)));
  refreshesData();
  return { ok: true };
}
