'use server';

// Issue drafts: private to their author. Saving needs write access to the
// project (only writers can create issues); every read and delete is scoped
// to the session user, so a draft id alone never exposes someone else's draft.

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { issueDrafts } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { getSession } from '@/lib/session';
import { DESCRIPTION_MAX, TITLE_MAX } from '@/lib/issue-service';
import {
  sanitizeIssueDefaults,
  type IssueDefaults,
} from '@/components/productivity/issue-defaults';

export interface DraftSnapshot {
  id: string;
  projectId: string;
  title: string;
  description: string;
  data: IssueDefaults;
}

type Fail = { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';

/**
 * Upsert by a client-generated id, so saves racing each other (debounced
 * autosave while a previous save is in flight) land on the same row.
 */
export async function saveDraft(input: {
  projectId: string;
  id: string;
  title: string;
  description: string;
  data: unknown;
}): Promise<{ ok: true } | Fail> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  if (typeof input.id !== 'string' || !UUID_RE.test(input.id)) {
    return { ok: false, error: 'Invalid draft.' };
  }

  const title = text(input.title, TITLE_MAX);
  const description = text(input.description, DESCRIPTION_MAX);
  const data = await sanitizeIssueDefaults(input.projectId, input.data);
  const now = new Date();

  const rows = await db
    .insert(issueDrafts)
    .values({
      id: input.id,
      userId: authz.userId,
      projectId: input.projectId,
      title,
      description: description || null,
      data,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: issueDrafts.id,
      set: { title, description: description || null, data, updatedAt: now },
      // Never overwrite a row that belongs to another user or project.
      setWhere: and(
        eq(issueDrafts.userId, authz.userId),
        eq(issueDrafts.projectId, input.projectId),
      ),
    })
    .returning({ id: issueDrafts.id });
  if (rows.length === 0) return { ok: false, error: 'Invalid draft.' };
  return { ok: true };
}

export async function getDraft(input: {
  projectId: string;
  id: string;
}): Promise<{ ok: true; draft: DraftSnapshot } | Fail> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  if (typeof input.id !== 'string') return { ok: false, error: 'Draft not found.' };

  const [row] = await db
    .select()
    .from(issueDrafts)
    .where(
      and(
        eq(issueDrafts.id, input.id),
        eq(issueDrafts.userId, authz.userId),
        eq(issueDrafts.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, error: 'Draft not found.' };
  return {
    ok: true,
    draft: {
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      description: row.description ?? '',
      data: row.data as IssueDefaults,
    },
  };
}

async function sessionUserId() {
  const session = await getSession();
  return session?.user?.id ?? null;
}

export async function deleteDraft(input: { id: string }): Promise<{ ok: true } | Fail> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };
  if (typeof input?.id !== 'string') return { ok: false, error: 'Draft not found.' };
  await db
    .delete(issueDrafts)
    .where(and(eq(issueDrafts.id, input.id), eq(issueDrafts.userId, userId)));
  revalidatePath('/dashboard/drafts');
  return { ok: true };
}

export async function discardAllDrafts(): Promise<{ ok: true } | Fail> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };
  await db.delete(issueDrafts).where(eq(issueDrafts.userId, userId));
  revalidatePath('/dashboard/drafts');
  return { ok: true };
}
