// Outgoing webhooks dispatcher — called by emitIssueEvent after the response.
// Each enabled `webhook` row of the event's project receives one signed JSON
// POST per matching event (empty `events` = all types). Never throws.
//
// Receivers verify `X-Webhook-Signature: sha256=<hex>` = HMAC-SHA256(secret,
// raw body). There is no retry queue on the free tier: a failed delivery is
// recorded in lastStatus (0 = network error / timeout / refused URL) and dropped.

import { createHmac, randomBytes } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { webhooks } from '@/db/schema';
import type { StoredIssueEvent } from '@/lib/events';
import { issueSummary, loadEventContext } from '@/lib/integrations/event-context';
import { isDeliverableUrl } from '@/lib/integrations/url-guard';

const TIMEOUT_MS = 5000;

export interface WebhookPayload {
  id: string;
  type: string;
  createdAt: string;
  projectId: string;
  actor: { id: string; name: string } | null;
  issue: ReturnType<typeof issueSummary> | null;
  data: Record<string, unknown>;
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** One delivery. Resolves to the HTTP status; 0 = refused URL, network error or timeout. */
export async function sendWebhook(
  hook: { url: string; secret: string },
  payload: WebhookPayload,
): Promise<number> {
  if (!(await isDeliverableUrl(hook.url))) return 0;
  const body = JSON.stringify(payload);
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TicketSystem-Webhooks/1.0',
        'X-Webhook-Event': payload.type,
        'X-Webhook-Delivery': payload.id,
        'X-Webhook-Signature': signWebhookBody(hook.secret, body),
      },
      body,
      // A redirect could point anywhere (including internal hosts): don't follow.
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.status;
  } catch {
    return 0;
  }
}

async function run(events: StoredIssueEvent[]) {
  const projectIds = [...new Set(events.map((e) => e.projectId))];
  const hooks = await db
    .select({
      id: webhooks.id,
      projectId: webhooks.projectId,
      url: webhooks.url,
      secret: webhooks.secret,
      events: webhooks.events,
    })
    .from(webhooks)
    .where(and(inArray(webhooks.projectId, projectIds), eq(webhooks.enabled, true)));
  if (hooks.length === 0) return;

  const plan = hooks
    .map((hook) => ({
      hook,
      events: events.filter(
        (e) =>
          e.projectId === hook.projectId &&
          (hook.events.length === 0 || hook.events.includes(e.type)),
      ),
    }))
    .filter((p) => p.events.length > 0);
  if (plan.length === 0) return;

  const ctx = await loadEventContext([...new Set(plan.flatMap((p) => p.events))]);
  const toPayload = (event: StoredIssueEvent): WebhookPayload => {
    const issue = event.ticketId ? ctx.issues.get(event.ticketId) : undefined;
    const actorName = event.actorId ? ctx.actorNames.get(event.actorId) : undefined;
    return {
      id: event.id,
      type: event.type,
      createdAt: event.createdAt.toISOString(),
      projectId: event.projectId,
      actor: event.actorId ? { id: event.actorId, name: actorName ?? '' } : null,
      issue: issue ? issueSummary(issue) : null,
      data: event.data,
    };
  };

  await Promise.all(
    plan.map(async ({ hook, events: list }) => {
      // In order per receiver; a dead endpoint stops the batch instead of
      // costing TIMEOUT_MS for every remaining event.
      let status = 0;
      for (const event of list) {
        status = await sendWebhook(hook, toPayload(event));
        if (status === 0) break;
      }
      await db
        .update(webhooks)
        .set({ lastStatus: status, lastDeliveredAt: new Date() })
        .where(eq(webhooks.id, hook.id));
    }),
  );
}

export async function deliverWebhooks(events: StoredIssueEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    await run(events);
  } catch (err) {
    console.error('[webhooks] dispatch failed', err);
  }
}
