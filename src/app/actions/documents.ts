'use server';

// Project document mutations. Everything needs write access to the document's
// project (guests read only); the project is always taken from the stored row,
// never from the client, and a linked epic must belong to that same project.

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { documents, epics } from '@/db/schema';
import {
  CONTENT_MAX,
  DOCUMENT_TEMPLATES,
  ICON_MAX,
  TITLE_MAX,
  documentPath,
  documentsPath,
  isTemplateId,
  type DocumentTemplateId,
} from '@/components/documents/document-model';
import { authorizeProjectAction } from '@/lib/action-auth';
import { docCollabKey } from '@/lib/collab/codec';
import { deleteCollabQueries } from '@/lib/collab/store';
import { db } from '@/lib/db';

export type DocumentActionResult = { ok: true; id: string } | { ok: false; error: string };

const ID = /^[A-Za-z0-9_-]{1,64}$/;

function revalidateDocs(projectId: string, documentId?: string) {
  revalidatePath(documentsPath(projectId));
  if (documentId) revalidatePath(documentPath(projectId, documentId));
}

async function epicInProject(epicId: unknown, projectId: string): Promise<string | null | false> {
  if (epicId === null) return null;
  if (typeof epicId !== 'string' || !ID.test(epicId)) return false;
  const [row] = await db
    .select({ id: epics.id })
    .from(epics)
    .where(and(eq(epics.id, epicId), eq(epics.projectId, projectId)))
    .limit(1);
  return row ? row.id : false;
}

/** Loads the document's project and checks the caller may write to it. */
async function authorizeDocument(documentId: unknown) {
  if (typeof documentId !== 'string' || !ID.test(documentId)) {
    return { ok: false as const, error: 'Document not found.' };
  }
  const [doc] = await db
    .select({ id: documents.id, projectId: documents.projectId, archivedAt: documents.archivedAt })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  // Same answer for "missing" and "not yours" (no id probing).
  if (!doc) return { ok: false as const, error: 'Document not found.' };
  const authz = await authorizeProjectAction(doc.projectId, 'write');
  if (!authz.ok) return { ok: false as const, error: authz.error === 'Forbidden' ? 'Document not found.' : authz.error };
  return { ok: true as const, doc, userId: authz.userId, role: authz.role };
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
  if (!authz.ok) return { ok: false, error: authz.error };
  const projectId = input.projectId;

  const template = DOCUMENT_TEMPLATES.find((t) => t.id === (isTemplateId(input.template) ? input.template : 'blank'))!;
  const epicId = input.epicId === undefined ? null : await epicInProject(input.epicId, projectId);
  if (epicId === false) return { ok: false, error: 'That epic isn’t in this project.' };

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
  revalidateDocs(projectId);
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
  if (doc.archivedAt) return { ok: false, error: 'Unarchive the document to edit it.' };

  const patch: Partial<typeof documents.$inferInsert> = {};
  if (input.title !== undefined) patch.title = cleanTitle(input.title);
  if (input.icon !== undefined) patch.icon = cleanIcon(input.icon);
  if (input.epicId !== undefined) {
    const epicId = await epicInProject(input.epicId, doc.projectId);
    if (epicId === false) return { ok: false, error: 'That epic isn’t in this project.' };
    patch.epicId = epicId;
  }
  if (Object.keys(patch).length === 0) return { ok: true, id: doc.id };

  await db
    .update(documents)
    .set({ ...patch, updatedById: userId, updatedAt: new Date() })
    .where(eq(documents.id, doc.id));
  revalidateDocs(doc.projectId, doc.id);
  return { ok: true, id: doc.id };
}

/**
 * The markdown snapshot of the collaborative state (search, previews, export,
 * backlinks). Sent by the active editor after typing pauses — last writer wins.
 * No revalidation: the open editor is the live view, lists are dynamic.
 */
export async function saveDocumentContent(input: { id: string; content: string }): Promise<DocumentActionResult> {
  if (typeof input?.content !== 'string') return { ok: false, error: 'Invalid content.' };
  if (input.content.length > CONTENT_MAX) return { ok: false, error: 'This document is too long to save.' };
  const auth = await authorizeDocument(input.id);
  if (!auth.ok) return auth;
  if (auth.doc.archivedAt) return { ok: false, error: 'Unarchive the document to edit it.' };

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
  revalidateDocs(auth.doc.projectId, auth.doc.id);
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
  await db.batch([db.delete(documents).where(eq(documents.id, doc.id)), ...deleteCollabQueries(docCollabKey(doc.id))]);
  revalidateDocs(doc.projectId);
  return { ok: true, id: doc.id };
}
