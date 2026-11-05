// Slack + outgoing webhooks (B11). Admin only: the Slack URL and webhook
// endpoints are effectively credentials, so other roles see a notice instead.

import { error, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';

import { projects, webhooks } from '@/db/schema';
import { db } from '@/lib/db';
import { parseSlackSetting } from '@/lib/integrations/event-types';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id } = params;
  if (!locals.user) redirect(303, '/login');

  const membership = await getMemberProject(id, locals.user.id);
  if (!membership) error(404, 'Not found');
  const isAdmin = roleAllows(membership.role, 'admin');

  if (!isAdmin) {
    return { projectId: id, projectName: membership.name, isAdmin, slack: null, hooks: [] };
  }

  const [[project], hooks] = await Promise.all([
    db
      .select({ slackWebhookUrl: projects.slackWebhookUrl, slackEvents: projects.slackEvents })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1),
    db
      .select({
        id: webhooks.id,
        url: webhooks.url,
        events: webhooks.events,
        enabled: webhooks.enabled,
        lastStatus: webhooks.lastStatus,
        lastDeliveredAt: webhooks.lastDeliveredAt,
        createdAt: webhooks.createdAt,
      })
      .from(webhooks)
      .where(eq(webhooks.projectId, id))
      .orderBy(asc(webhooks.createdAt)),
  ]);
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
