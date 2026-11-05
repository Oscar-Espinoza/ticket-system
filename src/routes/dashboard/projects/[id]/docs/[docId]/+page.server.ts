// A project document (port of src/app/dashboard/projects/[id]/docs/[docId]/page.tsx).
// The project layout authorized membership; the document reads are
// membership-gated in SQL as well, and a document of another project (or a
// missing one) is a 404.

import { error, redirect } from '@sveltejs/kit';

import { getDocument, getDocumentBacklinks } from '@/lib/documents';
import { getSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  const [document, backlinks] = await Promise.all([
    getDocument(params.id, params.docId, session.user.id),
    getDocumentBacklinks(params.id, params.docId, session.user.id),
  ]);
  if (!document) error(404, 'Not found');
  return { document, backlinks };
};
