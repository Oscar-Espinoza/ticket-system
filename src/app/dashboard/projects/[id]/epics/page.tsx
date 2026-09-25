// Epics list. The project layout already authorized the viewer; getProjectEpics
// is membership-gated in SQL too.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { EpicsList } from '@/components/epics/epics-list';
import { getProjectEpics } from '@/lib/epics';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Epics' };

export default async function EpicsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const { epics } = await getProjectEpics(id, session.user.id);
  return <EpicsList epics={epics} />;
}
