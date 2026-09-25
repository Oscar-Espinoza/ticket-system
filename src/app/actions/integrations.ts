'use server';

// Slack + outgoing webhook settings (admin only). Every action re-authorizes
// with authorizeProjectAction and scopes webhook rows by (id, project id), so a
// webhook id from another project is simply "not found".

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { and, count, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects, webhookDeliveries, webhooks } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import {
  isWebhookEventType,
  normalizeSlackEvents,
  parseSlackSetting,
  SLACK_URL_PREFIX,
} from '@/lib/integrations/event-types';
import { sendSlackMessage, slackEscape } from '@/lib/integrations/slack';
import {
  generateWebhookSecret,
  isSuccess,
  recentDeliveries,
  redeliver,
  retryDueDeliveries,
  sendLoggedDelivery,
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

/** One logged attempt series of an event to a webhook (settings delivery log). */
export interface WebhookDeliveryView {
  id: string;
  eventType: string;
  /** Attempts made so far (0 = not attempted yet). */
  attempt: number;
  /** Last HTTP status; 0 = refused / network error; null = not attempted. */
  status: number | null;
  error: string | null;
  /** Next retry; null = delivered or given up. */
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
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
      .set({ slackWebhookUrl: null, slackEvents: null, updatedAt: new Date() })
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
  const events = normalizeSlackEvents(input.events);

  // Both columns on every save — this is also what drops a legacy
  // `#events=` fragment from rows written before slack_events existed.
  await db
    .update(projects)
    .set({ slackWebhookUrl: url, slackEvents: events, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  revalidate(projectId);
  return { ok: true, connected: true };
}

export async function sendSlackTest(input: { projectId: string }): Promise<Result> {
  const denied = await admin(input?.projectId);
  if (denied) return denied;

  const [project] = await db
    .select({
      name: projects.name,
      slackWebhookUrl: projects.slackWebhookUrl,
      slackEvents: projects.slackEvents,
    })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);
  const setting = parseSlackSetting(project?.slackWebhookUrl, project?.slackEvents);
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
}): Promise<Result<{ webhook: WebhookView; delivery: WebhookDeliveryView }>> {
  const auth = await authorizeProjectAction(input?.projectId, 'admin');
  if (!auth.ok) return { ok: false, error: auth.error };
  const hook = await findWebhook(input.projectId, input.id);
  if (!hook) return { ok: false, error: 'Webhook not found.' };

  // Logged like any delivery, but never retried.
  const delivery = await sendLoggedDelivery(
    hook,
    {
      id: crypto.randomUUID(),
      type: 'webhook.test',
      createdAt: new Date().toISOString(),
      projectId: input.projectId,
      actor: null,
      issue: null,
      data: { message: 'This is a test delivery.' },
    },
    { retry: false },
  );
  const [row] = await db
    .select(webhookColumns)
    .from(webhooks)
    .where(eq(webhooks.id, hook.id))
    .limit(1);
  revalidate(input.projectId);
  if (!isSuccess(delivery.status)) {
    return {
      ok: false,
      error:
        delivery.status === 0
          ? (delivery.error ?? 'Could not reach the endpoint.')
          : `The endpoint responded with HTTP ${delivery.status}.`,
    };
  }
  return { ok: true, webhook: toView(row), delivery: toDeliveryView(delivery) };
}

// ---------------------------------------------------------------------------
// Delivery log + retries
// ---------------------------------------------------------------------------

async function findWebhook(projectId: string, id: unknown) {
  if (typeof id !== 'string' || !id) return null;
  const [hook] = await db
    .select({ id: webhooks.id, url: webhooks.url, secret: webhooks.secret })
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.projectId, projectId)))
    .limit(1);
  return hook ?? null;
}

function toDeliveryView(row: typeof webhookDeliveries.$inferSelect): WebhookDeliveryView {
  return {
    id: row.id,
    eventType: row.eventType,
    attempt: row.attempt,
    status: row.attempt === 0 ? null : row.status,
    error: row.error,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    payload: row.payload,
  };
}

/** The last 20 deliveries of a webhook, newest first. */
export async function listWebhookDeliveries(input: {
  projectId: string;
  webhookId: string;
}): Promise<Result<{ deliveries: WebhookDeliveryView[] }>> {
  const denied = await admin(input?.projectId);
  if (denied) return denied;
  const hook = await findWebhook(input.projectId, input.webhookId);
  if (!hook) return { ok: false, error: 'Webhook not found.' };
  const rows = await recentDeliveries(hook.id, 20);
  return { ok: true, deliveries: rows.map(toDeliveryView) };
}

/** Resend a logged delivery now (its next attempt). */
export async function redeliverWebhookDelivery(input: {
  projectId: string;
  webhookId: string;
  deliveryId: string;
}): Promise<Result<{ delivery: WebhookDeliveryView; webhook: WebhookView }>> {
  const denied = await admin(input?.projectId);
  if (denied) return denied;
  const hook = await findWebhook(input.projectId, input.webhookId);
  if (!hook || typeof input.deliveryId !== 'string') return { ok: false, error: 'Delivery not found.' };

  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.id, input.deliveryId), eq(webhookDeliveries.webhookId, hook.id)))
    .limit(1);
  if (!delivery) return { ok: false, error: 'Delivery not found.' };

  const updated = await redeliver(hook, delivery);
  const [row] = await db
    .select(webhookColumns)
    .from(webhooks)
    .where(eq(webhooks.id, hook.id))
    .limit(1);
  revalidate(input.projectId);
  return { ok: true, delivery: toDeliveryView(updated), webhook: toView(row) };
}

/**
 * Lazy retry hook for the settings page: resend this project's due deliveries
 * after the response (no queue on the free tier; the daily cron also sweeps).
 */
export async function retryWebhookDeliveries(input: { projectId: string }): Promise<Result> {
  const denied = await admin(input?.projectId);
  if (denied) return denied;
  const { projectId } = input;
  after(() => retryDueDeliveries({ projectId, limit: 20 }).then(() => undefined));
  return { ok: true };
}
