// Slack + outgoing webhooks. Admin only: the Slack URL and webhook
// endpoints are effectively credentials, so other roles see a notice instead.

import { parseSlackSetting } from '@/lib/integrations/event-types';
import { getProjectWebhooks, getSlackSetting } from '@/lib/project-settings-read';
import { roleAllows } from '@/lib/roles';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const { project: membership } = await loadViewerProject(id);
  const isAdmin = roleAllows(membership.role, 'admin');

  if (!isAdmin) {
    return { projectId: id, projectName: membership.name, isAdmin, slack: null, hooks: [] };
  }

  const [project, hooks] = await Promise.all([getSlackSetting(id), getProjectWebhooks(id)]);
  const slack = parseSlackSetting(project?.slackWebhookUrl, project?.slackEvents);

  return {
    projectId: id,
    projectName: membership.name,
    isAdmin,
    slack,
    hooks: hooks.map((hook) => ({
      ...hook,
      lastDeliveredAt: hook.lastDeliveredAt?.toISOString() ?? null,
      createdAt: hook.createdAt.toISOString(),
    })),
  };
};
