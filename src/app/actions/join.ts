'use server';

// joinProject Server Action — MEM-02
//
// Idempotent join via invite token:
//   1. Validate session (not authenticated → return error, no insert).
//   2. Resolve the invitation by token AND expiresAt > now (expired/unknown → return error).
//   3. Check if already a member (check-then-insert for app-level idempotency).
//   4. Insert project_member row with role 'member'. Map SQLSTATE 23505 (concurrent
//      double-join) to "already a member" (the race-safe backstop, D-29).
//      Re-throw any other code.
//   5. Call revalidatePath + redirect OUTSIDE the DB try/catch — redirect() throws
//      NEXT_REDIRECT which the catch block would otherwise swallow.
//
// D-27: join only fires on the explicit POST from JoinProjectButton — never on GET.
// D-28: unknown/expired token → { error: 'invalid' }, no project info leaked.
// D-29: check-then-insert + 23505 backstop for race-safe idempotency.

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, gt } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { invitations, projectMembers } from '@/db/schema';

export type JoinProjectState = {
  error?: string;
};

export async function joinProject(
  prevState: JoinProjectState,
  formData: FormData,
): Promise<JoinProjectState> {
  // Step 1: Resolve session — never trust client-supplied userId.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: 'Not authenticated' };
  }

  // Step 2: Read token from form data.
  const token = ((formData.get('token') as string | null) ?? '').trim();
  if (!token) {
    return { error: 'invalid' };
  }

  // Step 3: Resolve the invitation by token AND expiresAt > now (D-24, D-28).
  // Filter expired tokens server-side — never leak project info (D-28).
  const [invitation] = await db
    .select({ projectId: invitations.projectId })
    .from(invitations)
    .where(
      and(
        eq(invitations.token, token),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!invitation) {
    // Unknown or expired token — clean error, no project info (D-28).
    return { error: 'invalid' };
  }

  const { projectId } = invitation;
  const userId = session.user.id;

  // Step 4: Check-then-insert with 23505 backstop (D-29).
  // DB try/catch handles only DB errors — redirect() is called OUTSIDE this block
  // because redirect() throws NEXT_REDIRECT (a non-Error), which a catch clause
  // would otherwise swallow.
  try {
    // App-level idempotency check: skip insert if user is already a member or owner.
    const [existing] = await db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!existing) {
      // New member — insert the project_member row.
      await db.insert(projectMembers).values({
        id: crypto.randomUUID(),
        projectId,
        userId,
        role: 'member',
        createdAt: new Date(),
      });
    }
    // If `existing` is truthy, the user is already a member/owner — skip insert
    // (idempotent path). Fall through to the redirect below.
  } catch (err: unknown) {
    // Map SQLSTATE 23505 (unique_violation) to the already-a-member no-op path.
    // A concurrent double-submit can race past the check above and hit the unique
    // constraint on (project_id, user_id) — treat as success (D-29).
    // WR-02: Neon may wrap the driver error, so also check one level of `.cause`.
    const code =
      (err as { code?: string })?.code ??
      (err as { cause?: { code?: string } })?.cause?.code;
    if (code === '23505') {
      // Race-safe backstop: duplicate insert → treat as already a member.
      // Fall through to redirect below.
    } else {
      // All other DB errors are unexpected — re-throw (REQUIRED, never swallow).
      throw err;
    }
  }

  // Step 5: All success paths (fresh join, already-member, 23505-backstop) arrive
  // here. redirect() throws NEXT_REDIRECT and MUST be called OUTSIDE the DB try/catch
  // so the catch block does not swallow it.
  revalidatePath(`/dashboard/projects/${projectId}`);
  redirect(`/dashboard/projects/${projectId}`);
}
