'use server';

// removeMember Server Action — MEM-05
//
// Owner-only hard-delete of a project_member row. Guards:
//   1. Session — unauthenticated callers get { errors: { server: 'Not authenticated' } }
//   2. requireProjectOwner — non-owners get { errors: { server: 'Forbidden' } }
//   3. Self-remove rejection — owner cannot remove themselves
//   4. Owner row protection — the 'owner' row cannot be removed
//
// Action is invoked via useActionState (prevState + FormData):
//   formData.get('projectId') — the project scope (untrusted URL param)
//   formData.get('memberId')  — the project_member row id to delete
//
// D-33: owner-unremovable, self-remove rejected.
// D-34: immediate access loss is structural — next requireProjectMember call throws.
// neon-http: single db.delete — no db.transaction.

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projectMembers } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireProjectOwner, ProjectAccessError } from '@/lib/project-access';

export type RemoveMemberState = {
  errors?: {
    server?: string;
  };
  success?: boolean;
};

export async function removeMember(
  _prevState: RemoveMemberState,
  formData: FormData,
): Promise<RemoveMemberState> {
  // Step 1: Resolve session — never trust client-supplied userId
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { errors: { server: 'Not authenticated' } };
  }

  const projectId = ((formData.get('projectId') as string | null) ?? '').trim();
  const memberId = ((formData.get('memberId') as string | null) ?? '').trim();

  if (!projectId || !memberId) {
    return { errors: { server: 'Missing required fields.' } };
  }

  // Step 2: Owner-only guard — requireProjectOwner verifies session user is an owner
  // before any destructive operation (D-33, T-03-12).
  try {
    await requireProjectOwner(projectId, session.user.id);
  } catch (err) {
    if (err instanceof ProjectAccessError) {
      return { errors: { server: 'Forbidden' } };
    }
    throw err; // REQUIRED: re-throw unexpected errors
  }

  // Step 3: Load the target member row (by its row id) to check role and userId
  // before deleting. Two guards follow:
  //   a. Self-remove rejection (D-33)
  //   b. Owner-row protection (D-33)
  //
  // ACKNOWLEDGED (checker WARNING 3): the role check SELECT is kept separate from
  // the DELETE intentionally. A conditional DELETE with rowsAffected=0 cannot
  // distinguish an owner row from an already-gone row, and neon-http rowsAffected
  // semantics are unreliable. The explicit SELECT produces the exact error messages
  // the UI-SPEC requires. See 03-PATTERNS.md.
  const [targetRow] = await db
    .select({
      userId: projectMembers.userId,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.id, memberId),
        eq(projectMembers.projectId, projectId),
      ),
    )
    .limit(1);

  if (!targetRow) {
    // Row does not exist (or belongs to a different project — scoped WHERE prevents IDOR)
    return { errors: { server: 'Member not found.' } };
  }

  // Guard a: Self-remove rejection — owner cannot remove their own row (D-33)
  if (targetRow.userId === session.user.id) {
    return { errors: { server: 'You cannot remove yourself.' } };
  }

  // Guard b: Owner-row protection — the owner row is unremovable in v1 (D-33, T-03-13)
  if (targetRow.role === 'owner') {
    return { errors: { server: 'The project owner cannot be removed.' } };
  }

  // Step 4: Hard-delete the member row (neon-http, no transaction)
  await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.id, memberId),
        eq(projectMembers.projectId, projectId),
      ),
    );

  // Step 5: Revalidate the members page so the roster re-renders without the row
  revalidatePath(`/dashboard/projects/${projectId}/members`);
  return { success: true };
}
