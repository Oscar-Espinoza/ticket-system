'use server';

// joinProject — accept an invitation by token (explicit POST from
// JoinProjectButton; visiting /invite/[token] is read-only).
//
//   - Valid token = not expired AND not yet accepted. Unknown / expired /
//     used tokens all return { error: 'invalid' } (no project info leaked).
//   - Shareable link (email null): reusable, joins as member.
//   - Email invitation: the signed-in email must match (case-insensitive),
//     else { error: 'wrong-account' }. It is single use: the row is claimed
//     with a conditional UPDATE … WHERE accepted_at IS NULL before the member
//     insert, so two concurrent accepts can't both succeed. The member joins
//     with the invitation's role; an existing member keeps theirs.
//   - Existing membership → idempotent success; 23505 is the race backstop.
//   - redirect() stays outside every try/catch (it throws NEXT_REDIRECT).

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { invitations, projectMembers } from '@/db/schema';

export type JoinProjectState = {
  error?: 'Not authenticated' | 'invalid' | 'wrong-account';
};

function isUniqueViolation(err: unknown) {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}

export async function joinProject(
  _prevState: JoinProjectState,
  formData: FormData,
): Promise<JoinProjectState> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { error: 'Not authenticated' };

  const token = ((formData.get('token') as string | null) ?? '').trim();
  if (!token) return { error: 'invalid' };

  const now = new Date();
  const [invitation] = await db
    .select({
      id: invitations.id,
      projectId: invitations.projectId,
      email: invitations.email,
      role: invitations.role,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.token, token),
        gt(invitations.expiresAt, now),
        isNull(invitations.acceptedAt),
      ),
    )
    .limit(1);
  if (!invitation) return { error: 'invalid' };

  const { projectId } = invitation;
  const userId = session.user.id;
  const isEmailInvite = invitation.email !== null;

  if (isEmailInvite && invitation.email!.toLowerCase() !== session.user.email.toLowerCase()) {
    return { error: 'wrong-account' };
  }

  const [existing] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);

  if (isEmailInvite) {
    const claimed = await db
      .update(invitations)
      .set({ acceptedAt: now })
      .where(and(eq(invitations.id, invitation.id), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id });
    // Someone (this user in another tab) accepted it a moment ago.
    if (claimed.length === 0 && !existing) return { error: 'invalid' };
  }

  if (!existing) {
    try {
      await db.insert(projectMembers).values({
        id: crypto.randomUUID(),
        projectId,
        userId,
        role: isEmailInvite ? invitation.role : 'member',
        createdAt: now,
      });
    } catch (err: unknown) {
      if (!isUniqueViolation(err)) {
        // Give the invitation back so the person can retry.
        if (isEmailInvite) {
          await db
            .update(invitations)
            .set({ acceptedAt: null })
            .where(eq(invitations.id, invitation.id));
        }
        throw err;
      }
      // 23505: a concurrent submit already inserted the row — treat as joined.
    }
  }

  revalidatePath('/dashboard', 'layout');
  redirect(`/dashboard/projects/${projectId}`);
}
