// Slack app: install
// into Slack workspaces (Asks → issues), pick where Asks land, and link your
// own Slack account for DM notifications.

import { getAdminProjects } from '@/lib/project-settings-read';
import { requireUser } from '@/lib/session';
import { getSlackInstallationsFor, getSlackUserLinks } from '@/lib/slack-settings-read';
import { slackConfig, slackManifest, slackUrls } from '@/lib/slack/config';
import type { SlackWorkspace } from '@/lib/components/slack/slack-types';
import type { PageServerLoad } from './$types';
import { m } from '@/lib/i18n';
import { lazyLabels } from '@/lib/lazy-labels';

const STATUS_MESSAGES: Record<string, string> = lazyLabels({
  installed: m.shared_slack_installed,
  linked: m.shared_slack_linked,
});

const ERROR_MESSAGES: Record<string, string> = lazyLabels({
  not_configured: m.shared_slack_not_configured,
  denied: m.shared_slack_denied,
  state: m.shared_slack_state,
  session: m.shared_slack_session,
  exchange: m.shared_slack_exchange,
  enterprise: m.shared_slack_enterprise,
  not_installed: m.shared_slack_not_installed,
});
const known = (map: Record<string, string>, key: string | undefined) =>
  key && Object.hasOwn(map, key) ? map[key] : undefined;

export const load: PageServerLoad = async ({ url }) => {
  const { id: userId } = await requireUser();
  // A repeated key is ignored.
  const single = (name: string) => {
    const values = url.searchParams.getAll(name);
    return values.length === 1 ? values[0] : undefined;
  };
  const status = single('slack');
  const reason = single('reason');

  const [links, adminProjects] = await Promise.all([getSlackUserLinks(userId), getAdminProjects(userId)]);

  const linkedTeams = links.map((link) => link.teamId);
  const installs = await getSlackInstallationsFor(userId, linkedTeams);

  const adminIds = new Set(adminProjects.map((p) => p.id));
  const notifyByTeam = new Map(links.map((link) => [link.teamId, link.notify]));
  const workspaces: SlackWorkspace[] = installs.map((install) => ({
    teamId: install.teamId,
    teamName: install.teamName ?? install.teamId,
    installedByName: install.installedByName,
    defaultProject: install.defaultProjectId
      ? { id: install.defaultProjectId, name: install.defaultProjectName ?? m.shared_unknown_project() }
      : null,
    canManage:
      install.installedById === userId ||
      (notifyByTeam.has(install.teamId) &&
        (!install.defaultProjectId || adminIds.has(install.defaultProjectId))),
    link: notifyByTeam.has(install.teamId) ? { notify: notifyByTeam.get(install.teamId)! } : null,
  }));

  const notice =
    status === 'error'
      ? { tone: 'error' as const, text: known(ERROR_MESSAGES, reason) ?? m.shared_slack_generic() }
      : known(STATUS_MESSAGES, status)
        ? { tone: 'success' as const, text: known(STATUS_MESSAGES, status)! }
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
