// A project document.
// The project layout authorized membership; the document reads are
// membership-gated in SQL as well, and a document of another project (or a
// missing one) is a 404.

import { error } from '@sveltejs/kit';

import { getDocument, getDocumentBacklinks } from '@/lib/documents';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const user = await requireUser();
  const [document, backlinks] = await Promise.all([
    getDocument(params.id, params.docId, user.id),
    getDocumentBacklinks(params.id, params.docId, user.id),
  ]);
  if (!document) error(404, 'Not found');
  return { document, backlinks };
};
