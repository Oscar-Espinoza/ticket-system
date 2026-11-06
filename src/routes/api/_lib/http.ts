// Small helpers shared by the session-authenticated route handlers.
// (Not a route: files in src/routes without a `+` prefix are ignored.)

import { NOT_AUTHENTICATED, type AuthFail } from '@/lib/server/action-kit';

/** Headers for responses that must never be cached (live state, per-viewer data). */
export const NO_STORE = { 'Cache-Control': 'no-store' };

/** CSP for user-uploaded bytes served from our origin: no scripts, no navigation, images only. */
export const SANDBOX_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";

/** Resolves after `ms`, or as soon as `signal` aborts (so a closed client never waits out a timer). */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}

/** `{ ok: false, error }` with `status`: the error body the browser-facing JSON routes share. */
export function fail(error: string, status: number): Response {
  return Response.json({ ok: false, error }, { status });
}

/** The refusal of a failed authorization: 401 when signed out, 403 otherwise. */
export function authFailResponse(authz: AuthFail): Response {
  return fail(authz.error, authz.error === NOT_AUTHENTICATED.error ? 401 : 403);
}

/** Multipart boundaries + the other form fields, on top of the file's own limit. */
const FORM_OVERHEAD = 64 * 1024;

/**
 * The multipart form of a single-file upload, or the response to refuse it with.
 * Bodies over `maxBytes` are refused from the Content-Length header, before
 * they are buffered.
 */
export async function readUploadForm(
  request: Request,
  maxBytes: number,
  tooLarge: string,
): Promise<{ ok: true; form: FormData } | { ok: false; response: Response }> {
  if (Number(request.headers.get('content-length')) > maxBytes + FORM_OVERHEAD) {
    return { ok: false, response: fail(tooLarge, 413) };
  }
  try {
    return { ok: true, form: await request.formData() };
  } catch {
    return { ok: false, response: fail('Invalid upload.', 400) };
  }
}

/** The form's `file` part, or the response to refuse it with. */
export function uploadedFile(
  form: FormData,
  maxBytes: number,
  tooLarge: string,
): { ok: true; file: File } | { ok: false; response: Response } {
  const file = form.get('file');
  if (!(file instanceof File)) return { ok: false, response: fail('No file received.', 400) };
  if (file.size > maxBytes) return { ok: false, response: fail(tooLarge, 413) };
  return { ok: true, file };
}
