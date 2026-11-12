// Dashboard layout: signed-out requests are turned away by the guard in
// src/hooks.server.ts (data requests included); requireUser is the typed
// read behind it. The shell data (projects, favorites, workspaces, inbox
// count) is loaded here for every dashboard page.

import { loadAppShellData } from '@/lib/components/app-shell/app-shell.server';
import { emailVerificationAvailable } from '@/lib/email-verification';
import { requireUser } from '@/lib/session';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
  const { id, email, name, image, emailVerified } = await requireUser();
  // Memoized per request — the dashboard page reuses getProjectsForUser.
  const shell = await loadAppShellData(id);

  return {
    user: { id, email, name, image: image ?? null },
    // The "verify your email" banner: only when the server can send the email.
    unverifiedEmail: !emailVerified && emailVerificationAvailable() ? email : null,
    ...shell,
  };
};
