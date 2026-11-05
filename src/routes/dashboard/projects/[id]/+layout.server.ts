// Project layout — the shared frame of every page under a project (issues,
// triage, cycles, settings…). Port of src/app/dashboard/projects/[id]/layout.tsx.
// Membership is checked here, before any project-scoped read reaches the page:
// getProjectData joins on the viewer's membership and returns null for
// outsiders → 404 (D-15, enumeration-resistant). Pages below can assume a
// member and read useProjectData().

import { error, redirect } from '@sveltejs/kit';

import { runProjectAutomations } from '@/lib/automation';
import { after } from '@/lib/kit/next-shims';
import { getProjectData } from '@/lib/project-data';
import { getSession } from '@/lib/session';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params }) => {
  const { id } = params;
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');

  // One round trip for everything the project's pages share; memoized per request.
  const projectData = await getProjectData(id, session.user.id);
  if (!projectData) error(404, 'Not found');

  // Lazy automations (no cron on the free tier) — after the response, never blocking it.
  after(async () => {
    try {
      await runProjectAutomations(id);
    } catch (err) {
      console.error('[automation] failed', err);
    }
  });

  return { projectData };
};
