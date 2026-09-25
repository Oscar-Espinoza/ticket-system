// My Issues — issues assigned to / created by / subscribed to by the viewer,
// plus the ones they recently acted on, across every project they belong to.
// Tabs are search params so each tab is one server query.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Bell, History, PenLine, Target } from 'lucide-react';

import { getProjectsForUser } from '@/components/project-list';
import { IssueGroups } from '@/components/navigation/issue-groups';
import { NavList } from '@/components/navigation/list-navigation';
import { NavIssueRow } from '@/components/navigation/nav-issue-row';
import { PageTabs } from '@/components/navigation/page-tabs';
import { EmptyState } from '@/components/ui-icons';
import { getSession } from '@/lib/session';
import {
  MY_ISSUES_TABS,
  getMyIssues,
  getMyRecentActivity,
  isMyIssuesTab,
  type MyIssuesTab,
} from './queries';

export const metadata: Metadata = { title: 'My issues' };

const EMPTY: Record<MyIssuesTab, { icon: React.ReactNode; title: string; description: string }> = {
  assigned: {
    icon: <Target />,
    title: 'Nothing assigned to you',
    description: 'Issues assigned to you in any of your projects show up here.',
  },
  created: {
    icon: <PenLine />,
    title: 'No issues created yet',
    description: 'Issues you create in any project show up here.',
  },
  subscribed: {
    icon: <Bell />,
    title: 'No subscriptions',
    description: 'Subscribe to an issue to follow its updates; it will show up here.',
  },
  activity: {
    icon: <History />,
    title: 'No recent activity',
    description: 'Issues you change or comment on show up here, most recent first.',
  },
};

export default async function MyIssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session?.user) redirect('/login');
  const userId = session.user.id;
  const tab: MyIssuesTab = isMyIssuesTab(params.tab) ? params.tab : 'assigned';

  const [projects, content] = await Promise.all([
    getProjectsForUser(userId),
    tab === 'activity'
      ? getMyRecentActivity(userId).then((rows) => ({ kind: 'activity' as const, rows }))
      : getMyIssues(userId, tab).then((issues) => ({ kind: 'grouped' as const, issues })),
  ]);
  const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const isEmpty = content.kind === 'activity' ? content.rows.length === 0 : content.issues.length === 0;

  return (
    <div className="flex flex-col">
      <h1 className="mb-3 text-xl font-medium">My issues</h1>
      <PageTabs
        label="My issues"
        current={tab}
        tabs={MY_ISSUES_TABS.map((t) => ({
          id: t.id,
          label: t.label,
          href: t.id === 'assigned' ? '/dashboard/my-issues' : `/dashboard/my-issues?tab=${t.id}`,
        }))}
      />

      {isEmpty ? (
        <EmptyState {...EMPTY[tab]} />
      ) : content.kind === 'activity' ? (
        <NavList className="flex flex-col gap-px">
          {content.rows.map(({ issue, lastActedAt }) => (
            <NavIssueRow
              key={issue.id}
              issue={issue}
              project={projectNames[issue.projectId]}
              time={{ date: lastActedAt, label: 'You acted' }}
            />
          ))}
        </NavList>
      ) : (
        <IssueGroups issues={content.issues} projectNames={projectNames} />
      )}
    </div>
  );
}
