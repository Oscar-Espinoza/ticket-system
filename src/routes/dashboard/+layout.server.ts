// Dashboard auth guard — THE security boundary for protected routes (D-10).
// Port of src/app/dashboard/layout.tsx (+ the server half of AppShell).
//
// A SERVER-SIDE check in the layout load. The session is read from the
// incoming request cookies (Better Auth, via the shared getSession()). If there
// is no valid session we redirect to /login; otherwise the shell data
// (projects, favorites, workspaces, inbox count) is loaded for the shell.
// The session cookie cache (auth.ts) falls back to the DB when stale, so a
// signed-in refresh never bounces to /login.

import { redirect } from '@sveltejs/kit';

import { loadAppShellData } from '@/lib/components/app-shell/app-shell.server';
import { getSession } from '@/lib/session';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
  const session = await getSession();

  if (!session) {
    redirect(303, '/login');
  }

  const { id, email, name, image } = session.user;
  // Memoized per request — the dashboard page reuses getProjectsForUser.
  const shell = await loadAppShellData(id);

  return {
    user: { id, email, name, image: image ?? null },
    ...shell,
  };
};
