// POST /api/attachments — upload one file to an issue (multipart form:
// projectId, ticketId, file). A route handler rather than a server action
// because server actions cap request bodies at 1 MB.

import { revalidatePath } from 'next/cache';

import { authorizeProjectAction } from '@/lib/action-auth';
import { addFileAttachment } from '@/lib/attachments';
import { MAX_ATTACHMENT_BYTES } from '@/components/issue-hierarchy/attachment-utils';

// Multipart boundaries + the other fields.
const FORM_OVERHEAD = 64 * 1024;

function fail(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  // Reject oversized bodies before buffering them.
  const length = Number(request.headers.get('content-length'));
  if (length > MAX_ATTACHMENT_BYTES + FORM_OVERHEAD) return fail('Files can be at most 5 MB.', 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Invalid upload.', 400);
  }

  const projectId = form.get('projectId');
  const authz = await authorizeProjectAction(projectId, 'write');
  if (!authz.ok) return fail(authz.error, authz.error === 'Not authenticated' ? 401 : 403);

  const file = form.get('file');
  if (!(file instanceof File)) return fail('No file received.', 400);
  if (file.size > MAX_ATTACHMENT_BYTES) return fail('Files can be at most 5 MB.', 413);

  const result = await addFileAttachment(authz.userId, projectId as string, {
    ticketId: form.get('ticketId'),
    name: file.name,
    type: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (!result.ok) return fail(result.error, 400);

  revalidatePath(`/dashboard/projects/${projectId}`, 'layout');
  return Response.json(result, { status: 201 });
}
