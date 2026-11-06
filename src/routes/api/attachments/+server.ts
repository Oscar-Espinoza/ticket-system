// POST /api/attachments — upload one file to an issue (multipart form:
// projectId, ticketId, file). A route handler rather than a server action
// because server actions cap request bodies at 1 MB.

import type { RequestHandler } from './$types';
import { fail, readUploadForm, uploadedFile } from '../_lib/http';
import { allowOptions } from '../_lib/options';

import { authorizeProjectAction } from '@/lib/action-auth';
import { addFileAttachment } from '@/lib/attachments';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from '@/lib/attachment-utils';

const TOO_LARGE = `Files can be at most ${MAX_ATTACHMENT_LABEL}.`;

export const POST: RequestHandler = async ({ request }) => {
  const read = await readUploadForm(request, MAX_ATTACHMENT_BYTES, TOO_LARGE);
  if (!read.ok) return read.response;
  const { form } = read;

  const projectId = form.get('projectId');
  const authz = await authorizeProjectAction(projectId, 'write');
  if (!authz.ok) return fail(authz.error, authz.error === 'Not authenticated' ? 401 : 403);

  const upload = uploadedFile(form, MAX_ATTACHMENT_BYTES, TOO_LARGE);
  if (!upload.ok) return upload.response;
  const { file } = upload;

  const result = await addFileAttachment(authz.userId, projectId as string, {
    ticketId: form.get('ticketId'),
    name: file.name,
    type: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (!result.ok) return fail(result.error, 400);

  // The caller refreshes page data itself (refreshAfterWrite()) once this resolves.
  return Response.json(result, { status: 201 });
};

export const OPTIONS = allowOptions('POST');
