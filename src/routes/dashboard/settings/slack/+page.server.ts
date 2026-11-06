// Slack app: install
// into Slack workspaces (Asks → issues), pick where Asks land, and link your
// own Slack account for DM notifications.

import { and, asc, eq, inArray, or } from 'drizzle-orm';

import { projectMembers, projects, slackInstallations, slackUserLinks, users } from '@/db/schema';
import { db } from '@/lib/db';
import { rolesAllowing } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { slackConfig, slackManifest, slackUrls } from '@/lib/slack/config';
import type { SlackWorkspace } from '@/lib/components/slack/slack-app-settings.svelte';
import type { PageServerLoad } from './$types';

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

export const load: PageServerLoad = async ({ url }) => {
  const { id: userId } = await requireUser();
  // A repeated key is ignored.
  const single = (name: string) => {
    const values = url.searchParams.getAll(name);
    return values.length === 1 ? values[0] : undefined;
  };
  const status = single('slack');
  const reason = single('reason');

  const [links, adminProjects] = await Promise.all([
    db
      .select({ teamId: slackUserLinks.teamId, notify: slackUserLinks.notify })
      .from(slackUserLinks)
      .where(eq(slackUserLinks.userId, userId)),
    db
      .select({ id: projects.id, name: projects.name, ticketKey: projects.ticketKey })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.role, rolesAllowing('admin'))))
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

  return {
    configured: slackConfig() !== null,
    urls: slackUrls(),
    manifest: slackManifest(),
    workspaces,
    adminProjects,
    notice,
  };
};
