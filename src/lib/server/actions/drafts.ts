// Issue drafts: private to their author. Saving needs write access to the
// project (only writers can create issues); every read and delete is scoped
// to the session user, so a draft id alone never exposes someone else's draft.

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { issueDrafts } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import {
  fail,
  NOT_AUTHENTICATED,
  refreshesData,
  type ActionResult,
} from '@/lib/server/action-kit';
import { isUuid } from '@/lib/ids';
import { sessionUserId } from '@/lib/session';
import { DESCRIPTION_MAX, TITLE_MAX } from '@/lib/issue-service';
import {
  sanitizeIssueDefaults,
  type IssueDefaults,
} from '@/lib/issue-defaults';

export interface DraftSnapshot {
  id: string;
  projectId: string;
  title: string;
  description: string;
  data: IssueDefaults;
}


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
}): Promise<ActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  if (!isUuid(input.id)) {
    return fail('Invalid draft.');
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
  if (rows.length === 0) return fail('Invalid draft.');
  return { ok: true };
}

export async function getDraft(input: {
  projectId: string;
  id: string;
}): Promise<ActionResult<{ draft: DraftSnapshot }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  if (typeof input.id !== 'string') return fail('Draft not found.');

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
  if (!row) return fail('Draft not found.');
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

export async function deleteDraft(input: { id: string }): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return NOT_AUTHENTICATED;
  if (typeof input?.id !== 'string') return fail('Draft not found.');
  await db
    .delete(issueDrafts)
    .where(and(eq(issueDrafts.id, input.id), eq(issueDrafts.userId, userId)));
  refreshesData();
  return { ok: true };
}

export async function discardAllDrafts(): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return NOT_AUTHENTICATED;
  await db.delete(issueDrafts).where(eq(issueDrafts.userId, userId));
  refreshesData();
  return { ok: true };
}
