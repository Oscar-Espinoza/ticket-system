// Dashboard layout: signed-out requests are turned away by the guard in
// src/hooks.server.ts (data requests included); requireSession is the typed
// read behind it. The shell data (projects, favorites, workspaces, inbox
// count) is loaded here for every dashboard page.

import { loadAppShellData } from '@/lib/components/app-shell/app-shell.server';
import { emailVerificationAvailable } from '@/lib/email-verification';
import { CLAIM_NOTICE_SESSION_AGE_MS, takeClaimNotice } from '@/lib/server/account-claim';
import { requireSession } from '@/lib/session';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
  const { user, session } = await requireSession();
  const { id, email, name, image, emailVerified } = user;
  // Memoized per request — the dashboard page reuses getProjectsForUser.
  const shell = await loadAppShellData(id);
  // "Your account was secured" (an unverified account claimed by a reset or
  // a first SSO sign-in): shown once, on the first page of a new session.
  const fresh = Date.now() - new Date(session.createdAt).getTime() < CLAIM_NOTICE_SESSION_AGE_MS;
  const claimNotice = fresh ? await takeClaimNotice(id) : null;

  return {
    user: { id, email, name, image: image ?? null },
    // The "verify your email" banner: only when the server can send the email.
    unverifiedEmail: !emailVerified && emailVerificationAvailable() ? email : null,
    claimNotice,
    ...shell,
  };
};
