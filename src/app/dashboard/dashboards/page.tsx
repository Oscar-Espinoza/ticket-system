// Dashboards (yours + shared into your projects) and the Pulse tab: the epic
// update feed and this week's numbers across your projects.

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DashboardList, NewDashboardButton } from '@/components/dashboards/dashboard-list';
import { PulseFeed } from '@/components/dashboards/pulse-feed';
import { getProjectsForUser } from '@/components/project-list';
import { getVisibleDashboards } from '@/lib/dashboards';
import { getPulseFeed } from '@/lib/pulse';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PULSE_DAYS = 30;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return { title: (await searchParams).tab === 'pulse' ? 'Pulse' : 'Dashboards' };
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        '-mb-px border-b-2 px-1 pb-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </Link>
  );
}

export default async function DashboardsPage({ searchParams }: { searchParams: SearchParams }) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session?.user) redirect('/login');
  const userId = session.user.id;
  const pulse = params.tab === 'pulse';
  const [projects, dashboards, feed] = await Promise.all([
    pulse ? [] : getProjectsForUser(userId),
    pulse ? [] : getVisibleDashboards(userId),
    pulse ? getPulseFeed(userId, PULSE_DAYS) : null,
  ]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-medium">{pulse ? 'Pulse' : 'Dashboards'}</h1>
        {!pulse && (
          <div className="ml-auto">
            <NewDashboardButton projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
          </div>
        )}
      </div>
      <nav aria-label="Dashboards sections" className="flex gap-4 border-b border-border">
        <Tab href="/dashboard/dashboards" active={!pulse}>
          Dashboards
        </Tab>
        <Tab href="/dashboard/dashboards?tab=pulse" active={pulse}>
          Pulse
        </Tab>
      </nav>
      {feed ? <PulseFeed pulse={feed} days={PULSE_DAYS} /> : <DashboardList dashboards={dashboards} />}
    </div>
  );
}
