// Project layout — the shared frame of every page under a project (issues,
// triage, cycles, settings…). Membership is checked here, before any
// project-scoped read reaches the page: getProjectData joins on the viewer's
// membership and returns null for outsiders → 404 (enumeration-resistant).
// Pages that need the project take it from `await parent()` (or
// loadViewerProject) rather than re-checking.

import { error } from '@sveltejs/kit';

import { runProjectAutomations } from '@/lib/automation';
import { after } from '@/lib/kit/request';
import { getProjectData } from '@/lib/project-data';
import { requireUser } from '@/lib/session';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params }) => {
  const { id } = params;
  const user = await requireUser();

  // One round trip for everything the project's pages share; memoized per request.
  const projectData = await getProjectData(id, user.id);
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
