// One dashboard: the owner's own, or one shared into a project the viewer
// belongs to. Widgets compute on the client from the scoped dataset.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { DashboardView } from '@/components/dashboards/dashboard-view';
import { getDashboardDataset, getDashboardForViewer } from '@/lib/dashboards';
import { roleAllows } from '@/lib/roles';
import { getSession } from '@/lib/session';

type Params = Promise<{ dashboardId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [session, { dashboardId }] = await Promise.all([getSession(), params]);
  const dashboard = session?.user ? await getDashboardForViewer(dashboardId, session.user.id) : null;
  return { title: dashboard?.name ?? 'Dashboard' };
}

export default async function DashboardPage({ params }: { params: Params }) {
  const [session, { dashboardId }] = await Promise.all([getSession(), params]);
  if (!session?.user) redirect('/login');
  const userId = session.user.id;

  const dashboard = await getDashboardForViewer(dashboardId, userId);
  if (!dashboard) notFound();
  const dataset = await getDashboardDataset(dashboard.projectId, userId);
  const isOwner = dashboard.ownerId === userId;
  const role = dashboard.projectId
    ? dataset.projects.find((p) => p.project.id === dashboard.projectId)?.project.role
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col">
      <DashboardView
        dashboard={dashboard}
        dataset={dataset}
        isOwner={isOwner}
        canShare={isOwner && role !== undefined && roleAllows(role, 'write')}
      />
    </div>
  );
}
