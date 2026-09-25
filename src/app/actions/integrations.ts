'use server';

// Slack + outgoing webhook settings (admin only). Every action re-authorizes
// with authorizeProjectAction and scopes webhook rows by (id, project id), so a
// webhook id from another project is simply "not found".

import { revalidatePath } from 'next/cache';
import { and, count, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects, webhooks } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import {
  formatSlackSetting,
  isSlackEventKind,
  isWebhookEventType,
  parseSlackSetting,
  SLACK_URL_PREFIX,
} from '@/lib/integrations/event-types';
import { sendSlackMessage, slackEscape } from '@/lib/integrations/slack';
import {
  generateWebhookSecret,
  sendWebhook,
} from '@/lib/integrations/outgoing-webhooks';
import { checkOutgoingUrl } from '@/lib/integrations/url-guard';

type Fail = { ok: false; error: string; field?: 'url' | 'events' };
type Result<T = object> = ({ ok: true } & T) | Fail;

/** What the settings UI shows for a webhook (never the secret). */
export interface WebhookView {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  lastStatus: number | null;
  lastDeliveredAt: string | null;
  createdAt: string;
}

const WEBHOOKS_MAX = 10;
const SLACK_URL_MAX = 500;

const webhookColumns = {
  id: webhooks.id,
  url: webhooks.url,
  events: webhooks.events,
  enabled: webhooks.enabled,
  lastStatus: webhooks.lastStatus,
  lastDeliveredAt: webhooks.lastDeliveredAt,
  createdAt: webhooks.createdAt,
};

function toView(row: {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  lastStatus: number | null;
  lastDeliveredAt: Date | null;
  createdAt: Date;
}): WebhookView {
  return {
    ...row,
    lastDeliveredAt: row.lastDeliveredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function admin(projectId: unknown): Promise<Fail | null> {
  const gate = await authorizeProjectAction(projectId, 'admin');
  return gate.ok ? null : { ok: false, error: gate.error };
}

function revalidate(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}/settings/integrations`);
}

function statusError(status: number, service: string): Fail {
  return {
    ok: false,
    error:
      status === 0
        ? `Could not reach ${service}.`
        : `${service} responded with HTTP ${status}.`,
  };
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

export async function saveSlackSettings(input: {
  projectId: string;
  url: string;
  events: string[];
}): Promise<Result<{ connected: boolean }>> {
  const denied = await admin(input?.projectId);
  if (denied) return denied;
  const { projectId } = input;

  const url = typeof input.url === 'string' ? input.url.trim() : '';
  if (!url) {
    await db
      .update(projects)
      .set({ slackWebhookUrl: null, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    revalidate(projectId);
    return { ok: true, connected: false };
  }

  if (!url.startsWith(SLACK_URL_PREFIX) || url.length > SLACK_URL_MAX || url.includes('#')) {
    return {
      ok: false,
      error: `Paste a Slack incoming webhook URL (${SLACK_URL_PREFIX}…).`,
      field: 'url',
    };
  }
  try {
    new URL(url);
  } catch {
    return { ok: false, error: 'Enter a valid URL.', field: 'url' };
  }
  if (!Array.isArray(input.events)) return { ok: false, error: 'Invalid events.', field: 'events' };
  const events = input.events.filter(isSlackEventKind);

  await db
    .update(projects)
    .set({ slackWebhookUrl: formatSlackSetting({ url, events }), updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  revalidate(projectId);
  return { ok: true, connected: true };
}

export async function sendSlackTest(input: { projectId: string }): Promise<Result> {
  const denied = await admin(input?.projectId);
  if (denied) return denied;

  const [project] = await db
    .select({ name: projects.name, slackWebhookUrl: projects.slackWebhookUrl })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);
  const setting = parseSlackSetting(project?.slackWebhookUrl);
  if (!project || !setting) return { ok: false, error: 'Save a Slack webhook URL first.' };

  const status = await sendSlackMessage(setting.url, {
    text: `Test message from ${project.name}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:wave: *${slackEscape(project.name)}* is connected. Selected issue events will post to this channel.`,
        },
      },
    ],
  });
  return status >= 200 && status < 300 ? { ok: true } : statusError(status, 'Slack');
}

// ---------------------------------------------------------------------------
// Outgoing webhooks
// ---------------------------------------------------------------------------

function normalizeEvents(raw: unknown): string[] | Fail {
  if (!Array.isArray(raw)) return { ok: false, error: 'Invalid events.', field: 'events' };
  return [...new Set(raw.filter(isWebhookEventType))];
}

export async function createWebhook(input: {
  projectId: string;
  url: string;
  events: string[];
  enabled?: boolean;
}): Promise<Result<{ webhook: WebhookView; secret: string }>> {
  const auth = await authorizeProjectAction(input?.projectId, 'admin');
  if (!auth.ok) return { ok: false, error: auth.error };
  const { projectId } = input;

  const url = checkOutgoingUrl(input.url);
  if (!url.ok) return { ok: false, error: url.error, field: 'url' };
  const events = normalizeEvents(input.events);
  if (!Array.isArray(events)) return events;

  const [{ total }] = await db
    .select({ total: count() })
    .from(webhooks)
    .where(eq(webhooks.projectId, projectId));
  if (total >= WEBHOOKS_MAX) {
    return { ok: false, error: `A project can have at most ${WEBHOOKS_MAX} webhooks.` };
  }

  const secret = generateWebhookSecret();
  const [row] = await db
    .insert(webhooks)
    .values({
      id: crypto.randomUUID(),
      projectId,
      url: url.url,
      secret,
      events,
      enabled: input.enabled !== false,
      createdById: auth.userId,
      createdAt: new Date(),
    })
    .returning(webhookColumns);
  revalidate(projectId);
  return { ok: true, webhook: toView(row), secret };
}

export async function updateWebhook(input: {
  projectId: string;
  id: string;
  url?: string;
  events?: string[];
  enabled?: boolean;
}): Promise<Result<{ webhook: WebhookView }>> {
  const denied = await admin(input?.projectId);
  if (denied) return denied;
  const { projectId } = input;

  const set: Partial<typeof webhooks.$inferInsert> = {};
  if (input.url !== undefined) {
    const url = checkOutgoingUrl(input.url);
    if (!url.ok) return { ok: false, error: url.error, field: 'url' };
    set.url = url.url;
  }
  if (input.events !== undefined) {
    const events = normalizeEvents(input.events);
    if (!Array.isArray(events)) return events;
    set.events = events;
  }
  if (input.enabled !== undefined) set.enabled = input.enabled === true;
  if (typeof input.id !== 'string' || Object.keys(set).length === 0) {
    return { ok: false, error: 'Nothing to update.' };
  }

  const [row] = await db
    .update(webhooks)
    .set(set)
    .where(and(eq(webhooks.id, input.id), eq(webhooks.projectId, projectId)))
    .returning(webhookColumns);
  if (!row) return { ok: false, error: 'Webhook not found.' };
  revalidate(projectId);
  return { ok: true, webhook: toView(row) };
}

export async function deleteWebhook(input: { projectId: string; id: string }): Promise<Result> {
  const denied = await admin(input?.projectId);
  if (denied) return denied;
  if (typeof input.id !== 'string') return { ok: false, error: 'Webhook not found.' };

  const [row] = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, input.id), eq(webhooks.projectId, input.projectId)))
    .returning({ id: webhooks.id });
  if (!row) return { ok: false, error: 'Webhook not found.' };
  revalidate(input.projectId);
  return { ok: true };
}

export async function revealWebhookSecret(input: {
  projectId: string;
  id: string;
}): Promise<Result<{ secret: string }>> {
  const denied = await admin(input?.projectId);
  if (denied) return denied;
  if (typeof input.id !== 'string') return { ok: false, error: 'Webhook not found.' };

  const [row] = await db
    .select({ secret: webhooks.secret })
    .from(webhooks)
    .where(and(eq(webhooks.id, input.id), eq(webhooks.projectId, input.projectId)))
    .limit(1);
  return row ? { ok: true, secret: row.secret } : { ok: false, error: 'Webhook not found.' };
}

export async function sendWebhookTest(input: {
  projectId: string;
  id: string;
}): Promise<Result<{ webhook: WebhookView }>> {
  const auth = await authorizeProjectAction(input?.projectId, 'admin');
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof input.id !== 'string') return { ok: false, error: 'Webhook not found.' };

  const [hook] = await db
    .select({ id: webhooks.id, url: webhooks.url, secret: webhooks.secret })
    .from(webhooks)
    .where(and(eq(webhooks.id, input.id), eq(webhooks.projectId, input.projectId)))
    .limit(1);
  if (!hook) return { ok: false, error: 'Webhook not found.' };

  const status = await sendWebhook(hook, {
    id: crypto.randomUUID(),
    type: 'webhook.test',
    createdAt: new Date().toISOString(),
    projectId: input.projectId,
    actor: null,
    issue: null,
    data: { message: 'This is a test delivery.' },
  });
  const [row] = await db
    .update(webhooks)
    .set({ lastStatus: status, lastDeliveredAt: new Date() })
    .where(eq(webhooks.id, hook.id))
    .returning(webhookColumns);
  revalidate(input.projectId);
  if (status < 200 || status >= 300) return statusError(status, 'The endpoint');
  return { ok: true, webhook: toView(row) };
}
