// Settings → GitLab, Bitbucket & Sentry (owner: D10b). Membership is checked
// here; every action re-checks the admin role. Tokens and secrets never leave
// the server — the client only learns what's connected.

import { error, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';

import { projectIntegrations, users } from '@/db/schema';
import { db } from '@/lib/db';
import { isUnreachableUrl } from '@/lib/github/webhooks';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import { GITLAB_DEFAULT_URL } from '@/lib/vcs/gitlab';
import { integrationWebhookUrl, sentryIntegrationId } from '@/lib/vcs/integrations';
import type {
  SentryIntegrationView,
  VcsIntegrationView,
} from '@/lib/components/developer/developer-settings.svelte';
import type { PageServerLoad } from './$types';

const str = (value: unknown) => (typeof value === 'string' ? value : null);

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id } = params;
  if (!locals.user) redirect(303, '/login');
  const membership = await getMemberProject(id, locals.user.id);
  if (!membership) error(404, 'Not found');

  const rows = await db
    .select({
      id: projectIntegrations.id,
      provider: projectIntegrations.provider,
      config: projectIntegrations.config,
      hasToken: sql<boolean>`${projectIntegrations.token} is not null`,
      connectedByName: users.name,
    })
    .from(projectIntegrations)
    .leftJoin(users, eq(users.id, projectIntegrations.createdById))
    .where(eq(projectIntegrations.projectId, id));

  const vcs = (provider: 'gitlab' | 'bitbucket'): VcsIntegrationView | null => {
    const row = rows.find((r) => r.provider === provider);
    const repo = str(row?.config.repo);
    if (!row || !repo) return null;
    const baseUrl = str(row.config.baseUrl);
    return {
      repo,
      webUrl: str(row.config.webUrl) ?? '#',
      baseUrl: baseUrl && baseUrl !== GITLAB_DEFAULT_URL ? baseUrl : null,
      webhookRegistered: !!str(row.config.webhookId),
      connectedByName: row.connectedByName,
    };
  };
  const sentryRow = rows.find((r) => r.provider === 'sentry');
  const sentry: SentryIntegrationView | null = sentryRow
    ? {
        webhookUrl: integrationWebhookUrl('sentry', sentryRow.id),
        hasToken: sentryRow.hasToken,
        connectedByName: sentryRow.connectedByName,
      }
    : null;
  const sentryWebhookUrl = integrationWebhookUrl('sentry', sentryRow?.id ?? sentryIntegrationId(id));
  const webhookBase = new URL(sentryWebhookUrl).origin;

  return {
    projectId: id,
    canEdit: roleAllows(membership.role, 'admin'),
    gitlab: vcs('gitlab'),
    bitbucket: vcs('bitbucket'),
    sentry,
    sentryWebhookUrl,
    webhookBase,
    webhookUnreachable: isUnreachableUrl(sentryWebhookUrl),
  };
};
