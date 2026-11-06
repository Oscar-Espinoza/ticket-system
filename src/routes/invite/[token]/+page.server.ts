// Invite landing page. PUBLIC route
// (outside /dashboard); it resolves the session itself and renders one of four
// states:
//
//   invalid   — unknown / expired / already-used token: a generic message
//               (never a 404, which would confirm whether a token exists)
//   signed out — sign-in CTA returning here (/login?redirect=/invite/[token])
//   mismatch  — email invitation for a different address than the session's
//   ready     — "Join {project}" with the role; JoinProjectButton POSTs
//
// Visiting is read-only: joining is the explicit POST in joinProject.

import { getOpenInvitation } from '@/lib/public-links-read';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { token } = params;

  const invitation = await getOpenInvitation(token);

  return {
    token,
    invitation: invitation ?? null,
    user: locals.user ? { email: locals.user.email } : null,
  };
};
