// Slack app (D7): install into Slack workspaces (Asks → issues), pick where
// Asks land, and link your own Slack account for DM notifications.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { and, asc, eq, inArray, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, projects, slackInstallations, slackUserLinks, users } from '@/db/schema';
import { getSession } from '@/lib/session';
import { slackConfig, slackManifest, slackUrls } from '@/lib/slack/config';
import { SlackAppSettings, type SlackWorkspace } from '@/components/slack/slack-app-settings';

export const metadata: Metadata = { title: 'Slack' };

const STATUS_MESSAGES: Record<string, string> = {
  installed: 'Slack workspace connected.',
  linked: 'Your Slack account is linked.',
};

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: 'The Slack app isn’t configured on this server yet.',
  denied: 'Slack authorization was cancelled.',
  state: 'That Slack authorization expired or was started in another browser. Try again.',
  session: 'Sign in as the account that started the Slack authorization and try again.',
  exchange: 'Slack didn’t accept the authorization. Try again.',
  enterprise: 'Enterprise Grid org-wide installs aren’t supported. Install into a single workspace.',
  not_installed: 'Add the app to that Slack workspace first, then link your account.',
};

export default async function SlackSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const userId = session.user.id;
  const params = await searchParams;
  const status = typeof params.slack === 'string' ? params.slack : undefined;
  const reason = typeof params.reason === 'string' ? params.reason : undefined;

  const [links, adminProjects] = await Promise.all([
    db
      .select({ teamId: slackUserLinks.teamId, notify: slackUserLinks.notify })
      .from(slackUserLinks)
      .where(eq(slackUserLinks.userId, userId)),
    db
      .select({ id: projects.id, name: projects.name, ticketKey: projects.ticketKey })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.role, ['owner', 'admin'])))
      .orderBy(asc(projects.name)),
  ]);

  const linkedTeams = links.map((link) => link.teamId);
  const installs = await db
    .select({
      teamId: slackInstallations.teamId,
      teamName: slackInstallations.teamName,
      installedById: slackInstallations.installedById,
      installedByName: users.name,
      defaultProjectId: slackInstallations.defaultProjectId,
      defaultProjectName: projects.name,
      createdAt: slackInstallations.createdAt,
    })
    .from(slackInstallations)
    .leftJoin(users, eq(users.id, slackInstallations.installedById))
    .leftJoin(projects, eq(projects.id, slackInstallations.defaultProjectId))
    .where(
      linkedTeams.length
        ? or(eq(slackInstallations.installedById, userId), inArray(slackInstallations.teamId, linkedTeams))
        : eq(slackInstallations.installedById, userId),
    )
    .orderBy(asc(slackInstallations.createdAt));

  const adminIds = new Set(adminProjects.map((p) => p.id));
  const notifyByTeam = new Map(links.map((link) => [link.teamId, link.notify]));
  const workspaces: SlackWorkspace[] = installs.map((install) => ({
    teamId: install.teamId,
    teamName: install.teamName ?? install.teamId,
    installedByName: install.installedByName,
    defaultProject: install.defaultProjectId
      ? { id: install.defaultProjectId, name: install.defaultProjectName ?? 'Unknown project' }
      : null,
    canManage:
      install.installedById === userId ||
      (notifyByTeam.has(install.teamId) &&
        (!install.defaultProjectId || adminIds.has(install.defaultProjectId))),
    link: notifyByTeam.has(install.teamId) ? { notify: notifyByTeam.get(install.teamId)! } : null,
  }));

  const notice =
    status === 'error'
      ? { tone: 'error' as const, text: ERROR_MESSAGES[reason ?? ''] ?? 'Something went wrong with Slack.' }
      : status && STATUS_MESSAGES[status]
        ? { tone: 'success' as const, text: STATUS_MESSAGES[status] }
        : null;

  return (
    <>
      <h1 className="text-xl font-medium">Slack</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        File issues from Slack with <span className="font-mono text-xs">/ask</span> or the
        “Create issue” message shortcut, and get your notifications as Slack DMs.
      </p>
      <SlackAppSettings
        configured={slackConfig() !== null}
        urls={slackUrls()}
        manifest={slackManifest()}
        workspaces={workspaces}
        adminProjects={adminProjects}
        notice={notice}
      />
    </>
  );
}
