// Issue search across the viewer's projects (Postgres full-text + filter
// syntax such as `label:bug is:open`; see lib/search).
// (Port of src/app/dashboard/search/page.tsx.)

import { redirect } from '@sveltejs/kit';

import { getProjectsForUser } from '@/lib/components/project-list.server';
import { searchDocuments } from '@/lib/documents';
import { searchIssues } from '@/lib/search';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, '/login');
  const userId = locals.user.id;

  // Next's `first()`: the first value of a repeated param, else ''.
  const first = (name: string) => url.searchParams.get(name) ?? '';
  const q = first('q').trim();
  const includeArchived = first('archived') === '1';
  const projects = await getProjectsForUser(userId);
  // Ignore a project filter the viewer can't see (the query is membership-scoped anyway).
  const requested = first('project');
  const projectId = projects.some((p) => p.id === requested) ? requested : null;

  // Docs match free text only: drop filter terms like `label:bug` first.
  const docText = q
    .replace(/(^|\s)-?[a-z]+:("[^"]*"|\S+)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const [results, allDocs] = await Promise.all([
    q ? searchIssues(userId, q, { projectId, includeArchived }) : Promise.resolve([]),
    docText ? searchDocuments(userId, docText, 10) : Promise.resolve([]),
  ]);
  const docs = projectId ? allDocs.filter((d) => d.projectId === projectId) : allDocs;
  const projectNames: Record<string, string> = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  return {
    q,
    includeArchived,
    projectId,
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    results,
    docs,
    projectNames,
  };
};
