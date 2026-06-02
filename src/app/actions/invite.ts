'use server';

// generateInviteLink Server Action — MEM-01
//
// Owner-only action that creates or replaces the single reusable invite link
// for a project. Enforces owner-only access server-side via requireProjectOwner
// (D-25). Uses delete-then-insert in db.batch to ensure exactly one active
// invitation row per project (D-22). Token is a 32-byte base64url value (256-bit
// entropy, URL-safe) per D-23. Expiry is 30 days from generation (D-24).
//
// Security: requireProjectOwner runs BEFORE any DB write — T-03-04 mitigation.
// No interactive transactions: uses db.batch (neon-http constraint).

import { randomBytes } from 'node:crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { invitations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  requireProjectOwner,
  ProjectAccessError,
} from '@/lib/project-access';

export type GenerateInviteState = {
  errors?: {
    server?: string;
  };
  success?: boolean;
  url?: string;
};

export async function generateInviteLink(
  prevState: GenerateInviteState | Record<string, never>,
  formData: FormData,
): Promise<GenerateInviteState> {
  // Step 1: Resolve session — never trust client-supplied userId (T-03-04).
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { errors: { server: 'Not authenticated' } };
  }

  // Step 2: Read projectId from FormData (untrusted — validate via DB check)
  const projectId = ((formData.get('projectId') as string | null) ?? '').trim();
  if (!projectId) {
    return { errors: { server: 'Project ID is required.' } };
  }

  // Step 3: Owner guard — requireProjectOwner runs BEFORE any invitation write
  // (403-before-DB guarantee, T-03-04). ProjectAccessError → Forbidden.
  // Re-throw unexpected errors — never swallow them.
  try {
    await requireProjectOwner(projectId, session.user.id);
  } catch (err) {
    if (err instanceof ProjectAccessError) {
      return { errors: { server: 'Forbidden' } };
    }
    throw err; // REQUIRED: re-throw non-domain errors
  }

  // Step 4: Generate a high-entropy URL-safe token (D-23).
  // 32 bytes = 256 bits of entropy; base64url encodes to 43 chars (URL-safe).
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days (D-24)
  const id = crypto.randomUUID();
  const now = new Date();

  // Step 5: Delete-then-insert in db.batch — atomically replaces any existing row
  // so exactly one active invitation exists per project at all times (D-22).
  // db.batch = neon-http multi-statement; NOT db.transaction (no interactive tx).
  try {
    await db.batch([
      db.delete(invitations).where(eq(invitations.projectId, projectId)),
      db.insert(invitations).values({ id, projectId, token, expiresAt, createdAt: now }),
    ]);
  } catch (err: unknown) {
    // Map SQLSTATE 23505 (token unique-violation, astronomically unlikely with 256-bit token)
    // to a recoverable user error. Re-throw any other code — never swallow unexpected errors.
    const code =
      (err as { code?: string })?.code ??
      (err as { cause?: { code?: string } })?.cause?.code;
    if (code === '23505') {
      return { errors: { server: 'Could not generate link, try again.' } };
    }
    throw err; // REQUIRED: re-throw non-domain errors
  }

  // Step 6: Revalidate the members page and return the absolute URL (D-25).
  revalidatePath(`/dashboard/projects/${projectId}/members`);
  return {
    success: true,
    url: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`,
  };
}
