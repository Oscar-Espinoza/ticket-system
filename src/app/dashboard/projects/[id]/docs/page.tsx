// Docs tab (D2). The project layout already authorized the viewer;
// getProjectDocuments is membership-gated in SQL too. `?q=` searches title and
// content server-side.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { DocumentsList } from '@/components/documents/documents-list';
import { getProjectDocuments } from '@/lib/documents';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Docs' };

export default async function DocsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query, session] = await Promise.all([params, searchParams, getSession()]);
  if (!session?.user) redirect('/login');
  const q = typeof query.q === 'string' ? query.q.slice(0, 200) : '';
  const documents = await getProjectDocuments(id, session.user.id, q);
  return <DocumentsList projectId={id} documents={documents} query={q} />;
}
