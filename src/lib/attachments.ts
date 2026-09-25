// Attachments DAL. NO AUTHORIZATION here except getAttachmentFile (which is
// membership-gated in SQL) — callers authorize first; every write is scoped to
// projectId. File bytes live base64 in attachment_blob, apart from the
// metadata, so listings never load them.

import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  attachmentBlobs,
  attachments,
  projectMembers,
  projects,
  tickets,
  users,
} from '@/db/schema';
import { prepareIssueEvents, publishIssueEvents } from '@/lib/events';
import {
  ATTACHMENT_TITLE_MAX,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
  linkTitle,
  normalizeContentType,
  parseLinkUrl,
  type AttachmentView,
} from '@/components/issue-hierarchy/attachment-utils';

export type AttachmentResult =
  | { ok: true; attachment: AttachmentView }
  | { ok: false; error: string };

/** The issue's attachments, newest first. */
export async function listAttachments(projectId: string, ticketId: string): Promise<AttachmentView[]> {
  const rows = await db
    .select({
      id: attachments.id,
      kind: attachments.kind,
      title: attachments.title,
      url: attachments.url,
      contentType: attachments.contentType,
      size: attachments.size,
      createdAt: attachments.createdAt,
      uploader: { id: users.id, name: users.name, image: users.image },
    })
    .from(attachments)
    .innerJoin(tickets, eq(attachments.ticketId, tickets.id))
    .leftJoin(users, eq(attachments.uploaderId, users.id))
    .where(and(eq(attachments.ticketId, ticketId), eq(tickets.projectId, projectId)))
    .orderBy(desc(attachments.createdAt));
  return rows;
}

interface IssueRef {
  id: string;
  key: string;
  title: string;
}

/** A live (not trashed) issue of the project. */
async function loadIssue(projectId: string, ticketId: unknown): Promise<IssueRef | null> {
  if (typeof ticketId !== 'string' || !ticketId) return null;
  const [row] = await db
    .select({
      id: tickets.id,
      number: tickets.ticketNumber,
      ticketKey: projects.ticketKey,
      title: tickets.title,
      deletedAt: tickets.deletedAt,
    })
    .from(tickets)
    .innerJoin(projects, eq(tickets.projectId, projects.id))
    .where(and(eq(tickets.id, ticketId), eq(tickets.projectId, projectId)))
    .limit(1);
  if (!row || row.deletedAt) return null;
  return { id: row.id, key: `${row.ticketKey}-${row.number}`, title: row.title };
}

function attachmentEvent(
  projectId: string,
  actorId: string,
  issue: IssueRef,
  type: 'attachment.added' | 'attachment.removed',
  attachment: { id: string; kind: 'file' | 'link'; title: string },
) {
  const summary =
    type === 'attachment.added'
      ? `${attachment.kind === 'file' ? 'attached' : 'added link'} ${attachment.title}`
      : `removed ${attachment.kind === 'file' ? 'attachment' : 'link'} ${attachment.title}`;
  return prepareIssueEvents([
    {
      projectId,
      ticketId: issue.id,
      actorId,
      type,
      data: { key: issue.key, title: issue.title, summary, attachment },
    },
  ]);
}

// Bumping updatedAt makes the issue's timeline (and list caches) refresh.
function touch(projectId: string, ticketId: string, now: Date) {
  return db
    .update(tickets)
    .set({ updatedAt: now })
    .where(and(eq(tickets.id, ticketId), eq(tickets.projectId, projectId)));
}

async function uploaderOf(userId: string) {
  const [user] = await db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

export async function addFileAttachment(
  actorId: string,
  projectId: string,
  input: { ticketId: unknown; name: string; type: string; bytes: Uint8Array },
): Promise<AttachmentResult> {
  if (input.bytes.byteLength === 0) return { ok: false, error: 'The file is empty.' };
  if (input.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: `Files can be at most ${MAX_ATTACHMENT_LABEL}.` };
  }
  const issue = await loadIssue(projectId, input.ticketId);
  if (!issue) return { ok: false, error: 'Issue not found.' };

  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    ticketId: issue.id,
    uploaderId: actorId,
    kind: 'file' as const,
    title: input.name.trim().slice(0, ATTACHMENT_TITLE_MAX) || 'Untitled file',
    url: null,
    contentType: normalizeContentType(input.type),
    size: input.bytes.byteLength,
    createdAt: now,
  };
  const events = attachmentEvent(projectId, actorId, issue, 'attachment.added', row);
  await db.batch([
    db.insert(attachments).values(row),
    db
      .insert(attachmentBlobs)
      .values({ attachmentId: row.id, dataBase64: Buffer.from(input.bytes).toString('base64') }),
    touch(projectId, issue.id, now),
    events.insert,
  ]);
  publishIssueEvents(events.stored);
  return { ok: true, attachment: { ...row, uploader: await uploaderOf(actorId) } };
}

export async function addLinkAttachment(
  actorId: string,
  projectId: string,
  input: { ticketId: unknown; url: unknown; title?: unknown },
): Promise<AttachmentResult> {
  const url = parseLinkUrl(input.url);
  if (!url) return { ok: false, error: 'Enter a valid http(s) URL.' };
  const issue = await loadIssue(projectId, input.ticketId);
  if (!issue) return { ok: false, error: 'Issue not found.' };

  const given = typeof input.title === 'string' ? input.title.trim() : '';
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    ticketId: issue.id,
    uploaderId: actorId,
    kind: 'link' as const,
    title: (given || linkTitle(url)).slice(0, ATTACHMENT_TITLE_MAX),
    url,
    contentType: null,
    size: null,
    createdAt: now,
  };
  const events = attachmentEvent(projectId, actorId, issue, 'attachment.added', row);
  await db.batch([db.insert(attachments).values(row), touch(projectId, issue.id, now), events.insert]);
  publishIssueEvents(events.stored);
  return { ok: true, attachment: { ...row, uploader: await uploaderOf(actorId) } };
}

/** Uploader, or anyone allowed to administer the project (`canAdminister`). */
export async function removeAttachment(
  actor: { userId: string; canAdminister: boolean },
  projectId: string,
  attachmentId: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof attachmentId !== 'string' || !attachmentId) {
    return { ok: false, error: 'Attachment not found.' };
  }
  const [row] = await db
    .select({
      id: attachments.id,
      kind: attachments.kind,
      title: attachments.title,
      ticketId: attachments.ticketId,
      uploaderId: attachments.uploaderId,
    })
    .from(attachments)
    .innerJoin(tickets, eq(attachments.ticketId, tickets.id))
    .where(and(eq(attachments.id, attachmentId), eq(tickets.projectId, projectId)))
    .limit(1);
  if (!row) return { ok: false, error: 'Attachment not found.' };
  if (row.uploaderId !== actor.userId && !actor.canAdminister) {
    return { ok: false, error: 'Only the uploader or a project admin can delete this.' };
  }
  const issue = await loadIssue(projectId, row.ticketId);
  if (!issue) return { ok: false, error: 'Issue not found.' };

  const events = attachmentEvent(projectId, actor.userId, issue, 'attachment.removed', row);
  await db.batch([
    // The blob cascades.
    db.delete(attachments).where(eq(attachments.id, row.id)),
    touch(projectId, issue.id, new Date()),
    events.insert,
  ]);
  publishIssueEvents(events.stored);
  return { ok: true };
}

/**
 * An uploaded file with its bytes, only if `userId` is a member of the
 * attachment's issue's project (null otherwise — callers 404, enumeration-resistant).
 */
export async function getAttachmentFile(userId: string, attachmentId: string) {
  const [row] = await db
    .select({
      title: attachments.title,
      contentType: attachments.contentType,
      dataBase64: attachmentBlobs.dataBase64,
    })
    .from(attachments)
    .innerJoin(attachmentBlobs, eq(attachmentBlobs.attachmentId, attachments.id))
    .innerJoin(tickets, eq(attachments.ticketId, tickets.id))
    .innerJoin(
      projectMembers,
      and(eq(projectMembers.projectId, tickets.projectId), eq(projectMembers.userId, userId)),
    )
    .where(and(eq(attachments.id, attachmentId), eq(attachments.kind, 'file')))
    .limit(1);
  return row ?? null;
}
