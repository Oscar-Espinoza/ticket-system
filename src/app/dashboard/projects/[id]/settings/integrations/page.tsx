// Slack + outgoing webhooks (B11). Admin only: the Slack URL and webhook
// endpoints are effectively credentials, so other roles see a notice instead.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';

import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { db } from '@/lib/db';
import { projects, webhooks } from '@/db/schema';
import { roleAllows } from '@/lib/roles';
import { parseSlackSetting } from '@/lib/integrations/event-types';
import { SlackSettings } from '@/components/integrations/slack-settings';
import { WebhookSettings } from '@/components/integrations/webhook-settings';
import { Separator } from '@/components/ui/separator';

export const metadata: Metadata = { title: 'Slack & webhooks' };

export default async function IntegrationsSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');

  const membership = await getMemberProject(id, session.user.id);
  if (!membership) notFound();
  const isAdmin = roleAllows(membership.role, 'admin');

  const header = (
    <>
      <h1 className="text-xl font-medium">Slack & webhooks</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Send issue activity from {membership.name} to Slack and your own services.
      </p>
    </>
  );

  if (!isAdmin) {
    return (
      <>
        {header}
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Only project owners and admins can manage integrations.
        </p>
      </>
    );
  }

  const [[project], hooks] = await Promise.all([
    db
      .select({ slackWebhookUrl: projects.slackWebhookUrl })
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
  const slack = parseSlackSetting(project?.slackWebhookUrl);

  return (
    <>
      {header}
      <SlackSettings projectId={id} url={slack?.url ?? ''} events={slack?.events ?? []} />
      <Separator className="my-10" />
      <WebhookSettings
        projectId={id}
        webhooks={hooks.map((hook) => ({
          ...hook,
          lastDeliveredAt: hook.lastDeliveredAt?.toISOString() ?? null,
          createdAt: hook.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
