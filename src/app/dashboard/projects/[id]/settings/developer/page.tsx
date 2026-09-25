// Settings → GitLab, Bitbucket & Sentry (owner: D10b). Membership is checked
// here; every action re-checks the admin role. Tokens and secrets never leave
// the server — the client only learns what's connected.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';

import {
  DeveloperSettings,
  type SentryIntegrationView,
  type VcsIntegrationView,
} from '@/components/developer/developer-settings';
import { projectIntegrations, users } from '@/db/schema';
import { db } from '@/lib/db';
import { isUnreachableUrl } from '@/lib/github/webhooks';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import { getSession } from '@/lib/session';
import { GITLAB_DEFAULT_URL } from '@/lib/vcs/gitlab';
import { integrationWebhookUrl, sentryIntegrationId } from '@/lib/vcs/integrations';

export const metadata: Metadata = { title: 'GitLab, Bitbucket & Sentry' };

const str = (value: unknown) => (typeof value === 'string' ? value : null);

export default async function DeveloperSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const membership = await getMemberProject(id, session.user.id);
  if (!membership) notFound();

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

  return (
    <>
      <h1 className="text-xl font-medium">GitLab, Bitbucket &amp; Sentry</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Connect other code hosts and error tracking. Pull and merge requests link to issues the same way
        GitHub&apos;s do — by the issue ID in the branch name or title, or magic words like “Fixes”.
      </p>
      <DeveloperSettings
        projectId={id}
        canEdit={roleAllows(membership.role, 'admin')}
        gitlab={vcs('gitlab')}
        bitbucket={vcs('bitbucket')}
        sentry={sentry}
        sentryWebhookUrl={sentryWebhookUrl}
        webhookBase={webhookBase}
        webhookUnreachable={isUnreachableUrl(sentryWebhookUrl)}
      />
    </>
  );
}
