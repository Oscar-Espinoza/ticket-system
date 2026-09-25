// A project document (D2). The project layout authorized membership; the
// document reads are membership-gated in SQL as well, and a document of
// another project (or a missing one) is a 404.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { DocumentView } from '@/components/documents/document-view';
import { getDocument, getDocumentBacklinks } from '@/lib/documents';
import { getSession } from '@/lib/session';

type Params = Promise<{ id: string; docId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [{ id, docId }, session] = await Promise.all([params, getSession()]);
  const doc = session?.user ? await getDocument(id, docId, session.user.id) : null;
  return { title: doc ? doc.title : 'Document' };
}

export default async function DocumentPage({ params }: { params: Params }) {
  const [{ id, docId }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const [doc, backlinks] = await Promise.all([
    getDocument(id, docId, session.user.id),
    getDocumentBacklinks(id, docId, session.user.id),
  ]);
  if (!doc) notFound();
  // Keyed by id: switching docs must never reuse the previous doc's editor.
  return <DocumentView key={doc.id} document={doc} backlinks={backlinks} />;
}
