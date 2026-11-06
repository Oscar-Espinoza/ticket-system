// Docs tab. The project layout already authorized the viewer; getProjectDocuments is
// membership-gated in SQL too. `?q=` searches title and content server-side.

import { getProjectDocuments } from '@/lib/documents';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  const user = await requireUser();
  const raw = url.searchParams.get('q');
  const q = typeof raw === 'string' ? raw.slice(0, 200) : '';
  const documents = await getProjectDocuments(params.id, user.id, q);
  return { projectId: params.id, documents, query: q };
};
