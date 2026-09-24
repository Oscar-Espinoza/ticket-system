// Project layout — the shared frame of every page under a project (issues,
// triage, cycles, settings…). Membership is checked here, before any
// project-scoped read reaches the page: getProjectData joins on the viewer's
// membership and returns null for outsiders → notFound() (D-15, enumeration-
// resistant). Pages below can assume a member and read useProjectData().

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { after } from 'next/server';

import { DisplayOptionsProvider } from '@/components/issues/display-options';
import { ProjectDataProvider } from '@/components/project/project-data';
import { ProjectTabs } from '@/components/project/project-tabs';
import { LiveUpdates } from '@/components/project/slots/live-updates';
import { LabelChip } from '@/components/ui-icons';
import { runProjectAutomations } from '@/lib/automation';
import { getProjectData } from '@/lib/project-data';
import { getSession } from '@/lib/session';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  const data = session?.user ? await getProjectData(id, session.user.id) : null;
  return { title: data ? data.project.name : 'Project not found' };
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');

  // One round trip for everything the project's pages share; memoized per request.
  const data = await getProjectData(id, session.user.id);
  if (!data) notFound();

  // Lazy automations (no cron on the free tier) — after the response, never blocking it.
  after(async () => {
    try {
      await runProjectAutomations(id);
    } catch (err) {
      console.error('[automation] failed', err);
    }
  });

  return (
    <ProjectDataProvider value={data}>
      <DisplayOptionsProvider>
        <LiveUpdates projectId={id} />
        <div className="flex min-h-full flex-col">
          <div className="mb-3 flex items-center gap-3">
            <h1 className="truncate text-xl font-medium">{data.project.name}</h1>
            <LabelChip dot={false} className="font-mono">
              {data.project.ticketKey}
            </LabelChip>
          </div>
          <ProjectTabs projectId={id} />
          {children}
        </div>
      </DisplayOptionsProvider>
    </ProjectDataProvider>
  );
}
