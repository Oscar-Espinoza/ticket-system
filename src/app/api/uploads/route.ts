// POST /api/uploads — an image pasted into an editor outside an issue
// (multipart form: projectId, file). Anyone who may comment in the project may
// upload; raster images only, 4 MB. A route handler because server actions cap
// request bodies at 1 MB.

import { authorizeProjectAction } from '@/lib/action-auth';
import { createUpload } from '@/lib/uploads';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from '@/components/issue-hierarchy/attachment-utils';

// Multipart boundaries + the other fields.
const FORM_OVERHEAD = 64 * 1024;
const TOO_LARGE = `Images can be at most ${MAX_ATTACHMENT_LABEL}.`;

function fail(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
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
  const authz = await authorizeProjectAction(projectId, 'comment');
  if (!authz.ok) return fail(authz.error, authz.error === 'Not authenticated' ? 401 : 403);

  const file = form.get('file');
  if (!(file instanceof File)) return fail('No file received.', 400);
  if (file.size > MAX_ATTACHMENT_BYTES) return fail(TOO_LARGE, 413);

  const result = await createUpload(authz.userId, projectId as string, {
    name: file.name,
    type: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (!result.ok) return fail(result.error, 400);
  return Response.json(result, { status: 201 });
}
