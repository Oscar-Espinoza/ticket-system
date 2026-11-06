// Project document mutations. Everything needs write access to the document's
// project (guests read only); the project is always taken from the stored row,
// never from the client, and a linked epic must belong to that same project.

import { and, eq } from 'drizzle-orm';

import { documents, epics } from '@/db/schema';
import {
  CONTENT_MAX,
  DOCUMENT_TEMPLATES,
  ICON_MAX,
  TITLE_MAX,
  isTemplateId,
  type DocumentTemplateId,
} from '@/lib/document-model';
import { authorizeProjectAction, roleAllows } from '@/lib/action-auth';
import { deleteCollabState } from '@/lib/collab/store';
import { db } from '@/lib/db';
import { getDocumentAccess } from '@/lib/documents';
import {
  fail,
  NOT_AUTHENTICATED,
  refreshesData,
  type ActionResult,
} from '@/lib/server/action-kit';
import { isEntityId } from '@/lib/ids';
import { sessionUserId } from '@/lib/session';

export type DocumentActionResult = ActionResult<{ id: string }>;

const DOCUMENT_NOT_FOUND = fail('Document not found.');

async function epicInProject(epicId: unknown, projectId: string): Promise<string | null | false> {
  if (epicId === null) return null;
  if (!isEntityId(epicId)) return false;
  const [row] = await db
    .select({ id: epics.id })
    .from(epics)
    .where(and(eq(epics.id, epicId), eq(epics.projectId, projectId)))
    .limit(1);
  return row ? row.id : false;
}

/** Loads the document's project and checks the caller may write to it. */
async function authorizeDocument(documentId: unknown) {
  if (!isEntityId(documentId)) return DOCUMENT_NOT_FOUND;
  const userId = await sessionUserId();
  if (!userId) return NOT_AUTHENTICATED;
  const access = await getDocumentAccess(documentId, userId);
  // Same answer for "missing" and "not yours" (no id probing).
  if (!access || !roleAllows(access.role, 'write')) return DOCUMENT_NOT_FOUND;
  const doc = { id: documentId, projectId: access.projectId, archivedAt: access.archivedAt };
  return { ok: true as const, doc, userId, role: access.role };
}

function cleanTitle(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) || 'Untitled' : 'Untitled';
}

function cleanIcon(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, ICON_MAX) || null;
}

export async function createDocument(input: {
  projectId: string;
  template?: DocumentTemplateId;
  epicId?: string | null;
  title?: string;
}): Promise<DocumentActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const projectId = input.projectId;

  const template = DOCUMENT_TEMPLATES.find((t) => t.id === (isTemplateId(input.template) ? input.template : 'blank'))!;
  const epicId = input.epicId === undefined ? null : await epicInProject(input.epicId, projectId);
  if (epicId === false) return fail('That epic isn’t in this project.');

  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(documents).values({
    id,
    projectId,
    epicId,
    title: cleanTitle(input.title ?? template.title),
    icon: template.icon,
    content: template.content(),
    createdById: authz.userId,
    updatedById: authz.userId,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  });
  refreshesData();
  return { ok: true, id };
}

export async function updateDocument(input: {
  id: string;
  title?: string;
  icon?: string | null;
  epicId?: string | null;
}): Promise<DocumentActionResult> {
  const auth = await authorizeDocument(input?.id);
  if (!auth.ok) return auth;
  const { doc, userId } = auth;
  if (doc.archivedAt) return fail('Unarchive the document to edit it.');

  const patch: Partial<typeof documents.$inferInsert> = {};
  if (input.title !== undefined) patch.title = cleanTitle(input.title);
  if (input.icon !== undefined) patch.icon = cleanIcon(input.icon);
  if (input.epicId !== undefined) {
    const epicId = await epicInProject(input.epicId, doc.projectId);
    if (epicId === false) return fail('That epic isn’t in this project.');
    patch.epicId = epicId;
  }
  if (Object.keys(patch).length === 0) return { ok: true, id: doc.id };

  await db
    .update(documents)
    .set({ ...patch, updatedById: userId, updatedAt: new Date() })
    .where(eq(documents.id, doc.id));
  refreshesData();
  return { ok: true, id: doc.id };
}

/**
 * The markdown snapshot of the collaborative state (search, previews, export,
 * backlinks). Sent by the active editor after typing pauses — last writer wins.
 * No revalidation: the open editor is the live view, lists are dynamic.
 */
export async function saveDocumentContent(input: { id: string; content: string }): Promise<DocumentActionResult> {
  if (typeof input?.content !== 'string') return fail('Invalid content.');
  if (input.content.length > CONTENT_MAX) return fail('This document is too long to save.');
  const auth = await authorizeDocument(input.id);
  if (!auth.ok) return auth;
  if (auth.doc.archivedAt) return fail('Unarchive the document to edit it.');

  await db
    .update(documents)
    .set({ content: input.content.trim(), updatedById: auth.userId, updatedAt: new Date() })
    .where(eq(documents.id, auth.doc.id));
  return { ok: true, id: auth.doc.id };
}

async function setArchived(id: unknown, archived: boolean): Promise<DocumentActionResult> {
  const auth = await authorizeDocument(id);
  if (!auth.ok) return auth;
  const now = new Date();
  await db
    .update(documents)
    .set({ archivedAt: archived ? now : null, updatedById: auth.userId, updatedAt: now })
    .where(eq(documents.id, auth.doc.id));
  refreshesData();
  return { ok: true, id: auth.doc.id };
}

export async function archiveDocument(input: { id: string }) {
  return setArchived(input?.id, true);
}

export async function unarchiveDocument(input: { id: string }) {
  return setArchived(input?.id, false);
}

/** Permanent: the row, its collaborative state and its awareness rows. */
export async function deleteDocument(input: { id: string }): Promise<DocumentActionResult> {
  const auth = await authorizeDocument(input?.id);
  if (!auth.ok) return auth;
  const { doc } = auth;
  await db.batch([db.delete(documents).where(eq(documents.id, doc.id)), ...deleteCollabState('doc', doc.id)]);
  refreshesData();
  return { ok: true, id: doc.id };
}
