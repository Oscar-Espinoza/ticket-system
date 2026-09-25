// Client side of editor image uploads: an issue context goes through the
// attachments route (the image also shows in the issue's Attachments), any
// other project context through /api/uploads.

import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
  attachmentPath,
  isPreviewableImage,
} from '@/components/issue-hierarchy/attachment-utils';

export type UploadTarget = { projectId: string; ticketId?: string };

export type ImageUploadResult = { ok: true; url: string } | { ok: false; error: string };

export function isUploadableImage(file: File): boolean {
  return isPreviewableImage(file.type);
}

export async function uploadImage(target: UploadTarget, file: File): Promise<ImageUploadResult> {
  if (!isUploadableImage(file)) {
    return { ok: false, error: 'Only PNG, JPEG, GIF, WebP, AVIF or BMP images can be added.' };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: `Images can be at most ${MAX_ATTACHMENT_LABEL}.` };
  }
  const form = new FormData();
  form.set('projectId', target.projectId);
  if (target.ticketId) form.set('ticketId', target.ticketId);
  form.set('file', file);

  try {
    const response = await fetch(target.ticketId ? '/api/attachments' : '/api/uploads', {
      method: 'POST',
      body: form,
    });
    const body = (await response.json().catch(() => null)) as
      | { ok: true; url?: string; attachment?: { id: string } }
      | { ok: false; error: string }
      | null;
    if (!body) return { ok: false, error: 'Upload failed.' };
    if (!body.ok) {
      return { ok: false, error: body.error === 'Forbidden' ? "You can't upload images here." : body.error };
    }
    const url = body.attachment ? attachmentPath(body.attachment.id) : body.url;
    return url ? { ok: true, url } : { ok: false, error: 'Upload failed.' };
  } catch {
    return { ok: false, error: 'Upload failed — check your connection.' };
  }
}
