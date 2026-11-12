// POST { token } → whether this reset link secures an unverified account and
// what that removes (src/lib/account-claim.ts RESET_CLAIM_PREVIEW_PATH;
// answer: src/lib/server/email-proof.ts resetClaimPreview). The reset page
// asks before showing its form. The token travels in the body, never in a
// URL; without a working token the answer is always { claim: false }.
import { resetClaimPreview } from '@/lib/server/email-proof';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  let token: unknown = null;
  try {
    token = ((await request.json()) as { token?: unknown } | null)?.token;
  } catch {
    // Not JSON: no token.
  }
  return Response.json(await resetClaimPreview(token), { headers: { 'cache-control': 'no-store' } });
};
