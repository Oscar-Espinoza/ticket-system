// Docs tab (port of src/app/dashboard/projects/[id]/docs/page.tsx). The project
// layout already authorized the viewer; getProjectDocuments is
// membership-gated in SQL too. `?q=` searches title and content server-side.

import { redirect } from '@sveltejs/kit';

import { getProjectDocuments } from '@/lib/documents';
import { getSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  const raw = url.searchParams.get('q');
  const q = typeof raw === 'string' ? raw.slice(0, 200) : '';
  const documents = await getProjectDocuments(params.id, session.user.id, q);
  return { projectId: params.id, documents, query: q };
};
