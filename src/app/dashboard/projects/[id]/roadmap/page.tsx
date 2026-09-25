// Roadmap: the project's non-archived epics on a timeline. The project layout
// authorized the viewer; getProjectEpics is membership-gated in SQL too.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { RoadmapView } from '@/components/roadmap/roadmap-view';
import { getProjectEpics } from '@/lib/epics';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Roadmap' };

export default async function RoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const { epics, milestones } = await getProjectEpics(id, session.user.id);
  const active = epics.filter((epic) => !epic.archivedAt);
  const activeIds = new Set(active.map((epic) => epic.id));
  return (
    <RoadmapView
      epics={active}
      milestones={milestones.filter((milestone) => activeIds.has(milestone.epicId))}
    />
  );
}
