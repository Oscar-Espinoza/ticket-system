'use server';

// createProject Server Action — PROJ-01
//
// Validates input, performs the atomic two-row insert (project + owner
// project_member) via db.batch(), maps Postgres 23505 to a field-level
// error, and revalidates the dashboard.
//
// D-16: create via Dialog, not a /projects/new route.
// D-17: ticketKey must match /^[A-Z]{2,6}$/ server-side; client transform is UX only.
// D-18: atomic insert via db.batch — no sequential awaits (no ownerless-project window).

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, projectMembers } from '@/db/schema';

export type CreateProjectState = {
  errors?: {
    name?: string;
    ticketKey?: string;
    server?: string;
  };
  success?: boolean;
};

export async function createProject(
  prevState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  // Step 1: Resolve session on the server — never trust client-supplied userId
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { errors: { server: 'Not authenticated' } };
  }

  // Step 2: Read and trim inputs
  const name = ((formData.get('name') as string | null) ?? '').trim();
  const ticketKey = ((formData.get('ticketKey') as string | null) ?? '').trim();

  // Step 3: Validate — return early on any error, NO db write
  const errors: CreateProjectState['errors'] = {};
  if (!name) {
    errors.name = 'Project name is required.';
  }
  if (!/^[A-Z]{2,6}$/.test(ticketKey)) {
    errors.ticketKey = 'Key must be 2–6 uppercase letters.';
  }
  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  // Step 4: Generate stable IDs and timestamps
  const projectId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const now = new Date();

  // Step 5: Atomic two-row insert via db.batch — both rows created together
  // or both rolled back. No sequential awaits — eliminates the ownerless-project
  // failure window (D-18 / T-02-03).
  try {
    await db.batch([
      db.insert(projects).values({
        id: projectId,
        name,
        ticketKey,
        ticketCounter: 0,
        ownerId: session.user.id,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(projectMembers).values({
        id: memberId,
        projectId,
        userId: session.user.id,
        role: 'owner',
        createdAt: now,
      }),
    ]);
  } catch (err: unknown) {
    // Step 6: Map Postgres unique-violation to a field-level error.
    // NeonDbError carries .code from pg DatabaseError. SQLSTATE 23505 =
    // unique_violation — stable across Postgres versions and locales (T-02-04).
    if (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === '23505'
    ) {
      return {
        errors: {
          ticketKey: 'This key is already in use. Choose a different one.',
        },
      };
    }
    // Step 6b: Unexpected errors are re-thrown — never swallowed (T-02-06).
    throw err;
  }

  // Step 7: Revalidate and return success
  revalidatePath('/dashboard');
  return { success: true };
}
