// Shared request plumbing for the per-integration webhook routes (GitLab,
// Bitbucket, Sentry): bounded body read + JSON parse, and one uniform
// rejection so unknown ids and bad secrets are indistinguishable.

const MAX_BODY = 5 * 1024 * 1024;

export const rejected = () => Response.json({ error: 'Invalid signature' }, { status: 401 });

export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; raw: string; payload: unknown } | { ok: false; response: Response }> {
  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return { ok: false, response: Response.json({ error: 'Payload too large' }, { status: 413 }) };
  }
  try {
    return { ok: true, raw, payload: JSON.parse(raw) };
  } catch {
    return { ok: false, response: Response.json({ error: 'Invalid JSON' }, { status: 400 }) };
  }
}
