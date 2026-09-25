'use server';

// Attachment actions (list, add link, delete). File uploads go through
// POST /api/attachments instead: server actions cap request bodies at 1 MB.

import { revalidatePath } from 'next/cache';

import { authorizeProjectAction, roleAllows } from '@/lib/action-auth';
import {
  addLinkAttachment,
  listAttachments,
  removeAttachment,
  type AttachmentResult,
} from '@/lib/attachments';
import type { AttachmentView } from '@/components/issue-hierarchy/attachment-utils';

export type GetAttachmentsResult =
  | { ok: true; attachments: AttachmentView[] }
  | { ok: false; error: string };

export async function getIssueAttachments(input: {
  projectId: string;
  ticketId: string;
}): Promise<GetAttachmentsResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  if (typeof input.ticketId !== 'string' || !input.ticketId) {
    return { ok: false, error: 'Issue not found.' };
  }
  return { ok: true, attachments: await listAttachments(input.projectId, input.ticketId) };
}

export async function addLink(input: {
  projectId: string;
  ticketId: string;
  url: string;
  title?: string;
}): Promise<AttachmentResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await addLinkAttachment(authz.userId, input.projectId, input);
  // The issue's updatedAt moved (timeline refresh).
  if (result.ok) revalidatePath(`/dashboard/projects/${input.projectId}`, 'layout');
  return result;
}

export async function deleteAttachment(input: {
  projectId: string;
  attachmentId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await removeAttachment(
    { userId: authz.userId, canAdminister: roleAllows(authz.role, 'admin') },
    input.projectId,
    input.attachmentId,
  );
  if (result.ok) revalidatePath(`/dashboard/projects/${input.projectId}`, 'layout');
  return result;
}
