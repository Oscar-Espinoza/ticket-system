// POST /api/attachments — upload one file to an issue (multipart form:
// projectId, ticketId, file). A route handler rather than a server action
// because server actions cap request bodies at 1 MB.

import type { RequestHandler } from './$types';
import { allowOptions } from '../_lib/options';

import { authorizeProjectAction } from '@/lib/action-auth';
import { addFileAttachment } from '@/lib/attachments';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from '@/lib/attachment-utils';

// Multipart boundaries + the other fields.
const FORM_OVERHEAD = 64 * 1024;
const TOO_LARGE = `Files can be at most ${MAX_ATTACHMENT_LABEL}.`;

function fail(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

export const POST: RequestHandler = async ({ request }) => {
  // Reject oversized bodies before buffering them.
  const length = Number(request.headers.get('content-length'));
  if (length > MAX_ATTACHMENT_BYTES + FORM_OVERHEAD) return fail(TOO_LARGE, 413);

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
  if (file.size > MAX_ATTACHMENT_BYTES) return fail(TOO_LARGE, 413);

  const result = await addFileAttachment(authz.userId, projectId as string, {
    ticketId: form.get('ticketId'),
    name: file.name,
    type: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (!result.ok) return fail(result.error, 400);

  // Next called revalidatePath here; under SvelteKit the caller refreshes the
  // page data itself (refreshAfterWrite()) once this resolves.
  return Response.json(result, { status: 201 });
};

// Next answered OPTIONS automatically (204 + Allow); Kit would 405.
export const OPTIONS = allowOptions('POST');
