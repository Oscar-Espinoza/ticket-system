// POST /api/uploads — an image pasted into an editor outside an issue
// (multipart form: projectId, file). Anyone who may comment in the project may
// upload; raster images only, 4 MB. A route handler because server actions cap
// request bodies at 1 MB.

import type { RequestHandler } from './$types';
import { authFailResponse, fail, readUploadForm, uploadedFile } from '../_lib/http';
import { allowOptions } from '../_lib/options';

import { authorizeProjectAction } from '@/lib/action-auth';
import { createUpload } from '@/lib/uploads';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from '@/lib/attachment-utils';

const TOO_LARGE = `Images can be at most ${MAX_ATTACHMENT_LABEL}.`;

export const POST: RequestHandler = async ({ request }) => {
  const read = await readUploadForm(request, MAX_ATTACHMENT_BYTES, TOO_LARGE);
  if (!read.ok) return read.response;
  const { form } = read;

  const projectId = form.get('projectId');
  const authz = await authorizeProjectAction(projectId, 'comment');
  if (!authz.ok) return authFailResponse(authz);

  const upload = uploadedFile(form, MAX_ATTACHMENT_BYTES, TOO_LARGE);
  if (!upload.ok) return upload.response;
  const { file } = upload;

  const result = await createUpload(authz.userId, projectId as string, {
    name: file.name,
    type: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (!result.ok) return fail(result.error, 400);
  return Response.json(result, { status: 201 });
};

export const OPTIONS = allowOptions('POST');
