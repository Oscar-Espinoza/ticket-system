// Outgoing webhooks dispatcher — called by emitIssueEvent after the response.
// Each enabled `webhook` row of the event's project receives one signed JSON
// POST per matching event (empty `events` = all types). Never throws.
//
// Receivers verify `X-Webhook-Signature: sha256=<hex>` = HMAC-SHA256(secret,
// raw body). `X-Webhook-Delivery` is the event id — stable across retries, so
// receivers can dedupe on it.
//
// Every attempt is logged in `webhook_delivery`. A failure (non-2xx, timeout,
// refused URL) is retried after 1 min, 5 min, 30 min, 2 h and 12 h, then given
// up (MAX_ATTEMPTS). There is no queue on the free tier: due retries run lazily
// after the next delivery to the same webhooks, when the integrations settings
// page loads, and in the daily cron job. Due rows are claimed with a
// conditional UPDATE … RETURNING, so concurrent runners never double-send.
//
// Not delivered: bulk imports (`data.bulk` — a 500-row CSV must not fire 500
// requests at every receiver) and project-level audit events without a ticket
// (member / workflow / epic changes) unless they are a listed webhook type
// (`issue.purged`, whose issue is gone). Receivers get issue events only.

import { createHmac, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, lt, lte, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { db } from '@/lib/db';
import { webhookDeliveries, webhooks } from '@/db/schema';
import type { StoredIssueEvent } from '@/lib/events';
import { issueSummary, loadEventContext } from '@/lib/integrations/event-context';
import { isWebhookEventType } from '@/lib/integrations/event-types';
import { isDeliverableUrl } from '@/lib/integrations/url-guard';

const TIMEOUT_MS = 5000;
const MINUTE = 60_000;
/** Wait before retry n (after the n-th failed attempt). */
export const RETRY_DELAYS_MS = [MINUTE, 5 * MINUTE, 30 * MINUTE, 120 * MINUTE, 720 * MINUTE];
/** Initial attempt + one retry per delay. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** A claimed row is retried again after this if its runner dies mid-send. */
const CLAIM_LEASE_MS = 5 * MINUTE;
/** Delivery log retention (finished rows only). */
const RETENTION_MS = 30 * 24 * 60 * MINUTE;
const ERROR_MAX = 200;

export interface WebhookPayload {
  id: string;
  type: string;
  createdAt: string;
  projectId: string;
  actor: { id: string; name: string } | null;
  issue: ReturnType<typeof issueSummary> | null;
  data: Record<string, unknown>;
}

export interface WebhookTarget {
  id: string;
  url: string;
  secret: string;
}

export interface SendResult {
  /** HTTP status; 0 = refused URL, network error or timeout. */
  status: number;
  error: string | null;
}

type DeliveryRow = typeof webhookDeliveries.$inferSelect;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export const isSuccess = (status: number | null) => status !== null && status >= 200 && status < 300;

/** When to try again after `attempts` failed attempts (null = give up). */
export function nextRetryAt(attempts: number, now = Date.now()): Date | null {
  return attempts >= 1 && attempts < MAX_ATTEMPTS
    ? new Date(now + RETRY_DELAYS_MS[attempts - 1])
    : null;
}

/** One HTTP attempt. The SSRF guard runs every time (DNS can change between retries). */
export async function sendWebhook(
  hook: { url: string; secret: string },
  payload: WebhookPayload,
  attempt = 1,
): Promise<SendResult> {
  if (!(await isDeliverableUrl(hook.url))) {
    return { status: 0, error: 'Refused: the URL does not resolve to a public https host.' };
  }
  const body = JSON.stringify(payload);
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TicketSystem-Webhooks/1.0',
        'X-Webhook-Event': payload.type,
        'X-Webhook-Delivery': payload.id,
        'X-Webhook-Attempt': String(attempt),
        'X-Webhook-Signature': signWebhookBody(hook.secret, body),
      },
      body,
      // A redirect could point anywhere (including internal hosts): don't follow.
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Don't keep the socket busy reading a body we never look at.
    void res.body?.cancel().catch(() => undefined);
    return {
      status: res.status,
      error: isSuccess(res.status)
        ? null
        : res.status >= 300 && res.status < 400
          ? `Redirects are not followed (HTTP ${res.status}).`
          : `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`.slice(0, ERROR_MAX),
    };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const detail = err instanceof Error && err.cause instanceof Error ? err.cause.message : '';
    return {
      status: 0,
      error: (timedOut
        ? `Timed out after ${TIMEOUT_MS / 1000} s.`
        : `Could not connect${detail ? `: ${detail}` : '.'}`
      ).slice(0, ERROR_MAX),
    };
  }
}

/** Row update for a finished attempt number `attempt` (1-based). */
function attemptUpdate(attempt: number, result: SendResult, retry: boolean, now: number) {
  const ok = isSuccess(result.status);
  return {
    attempt,
    status: result.status,
    error: result.error,
    deliveredAt: ok ? new Date(now) : null,
    nextAttemptAt: ok || !retry ? null : nextRetryAt(attempt, now),
  };
}

function updateDelivery(id: string, set: Partial<typeof webhookDeliveries.$inferInsert>) {
  return db.update(webhookDeliveries).set(set).where(eq(webhookDeliveries.id, id));
}

function touchWebhook(id: string, status: number, now: number) {
  return db
    .update(webhooks)
    .set({ lastStatus: status, lastDeliveredAt: new Date(now) })
    .where(eq(webhooks.id, id));
}

/**
 * Send `rows` to one webhook in order. A network failure stops the batch — a
 * dead endpoint must not cost TIMEOUT_MS per event — and the rest wait a minute
 * without spending an attempt. Records everything in one write batch.
 */
async function sendBatch(hook: WebhookTarget, rows: Pick<DeliveryRow, 'id' | 'attempt' | 'payload'>[]) {
  const writes: BatchItem<'pg'>[] = [];
  let last: SendResult | null = null;
  let index = 0;
  for (; index < rows.length; index++) {
    const row = rows[index];
    const attempt = row.attempt + 1;
    last = await sendWebhook(hook, row.payload as unknown as WebhookPayload, attempt);
    writes.push(updateDelivery(row.id, attemptUpdate(attempt, last, true, Date.now())));
    if (last.status === 0) break;
  }
  const later = new Date(Date.now() + MINUTE);
  for (const row of rows.slice(index + 1)) {
    writes.push(
      updateDelivery(row.id, {
        nextAttemptAt: later,
        error: 'Not attempted: the endpoint was unreachable.',
      }),
    );
  }
  if (!last) return;
  await db.batch([touchWebhook(hook.id, last.status, Date.now()), ...writes]);
}

// ---------------------------------------------------------------------------
// New events
// ---------------------------------------------------------------------------

function deliverable(event: StoredIssueEvent): boolean {
  if (event.data.bulk === true) return false;
  return event.ticketId !== null || isWebhookEventType(event.type);
}

async function run(all: StoredIssueEvent[]) {
  const events = all.filter(deliverable);
  if (events.length === 0) return;
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

  // Log first (leased to us): if this function dies mid-send, the rows are
  // picked up as due retries instead of being lost.
  const now = Date.now();
  const batches = plan.map(({ hook, events: list }) => ({
    hook,
    rows: list.map((event) => ({
      id: crypto.randomUUID(),
      webhookId: hook.id,
      eventType: event.type,
      payload: toPayload(event) as unknown as Record<string, unknown>,
      attempt: 0,
      nextAttemptAt: new Date(now + CLAIM_LEASE_MS),
      createdAt: new Date(now),
    })),
  }));
  await db.insert(webhookDeliveries).values(batches.flatMap((b) => b.rows));

  await Promise.all(batches.map(({ hook, rows }) => sendBatch(hook, rows)));

  // Lazy retries for the same receivers (they just had a chance to recover).
  await retryDueDeliveries({ webhookIds: hooks.map((h) => h.id), limit: 20 });
}

export async function deliverWebhooks(events: StoredIssueEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    await run(events);
  } catch (err) {
    console.error('[webhooks] dispatch failed', err);
  }
}

// ---------------------------------------------------------------------------
// Retries
// ---------------------------------------------------------------------------

/**
 * Claim and resend due deliveries of enabled webhooks (optionally only some
 * webhooks / one project). Returns how many were attempted. Never throws.
 */
export async function retryDueDeliveries(
  options: { webhookIds?: string[]; projectId?: string; limit?: number } = {},
): Promise<number> {
  try {
    const now = new Date();
    const scope: SQL[] = [lte(webhookDeliveries.nextAttemptAt, now), eq(webhooks.enabled, true)];
    if (options.webhookIds) {
      if (options.webhookIds.length === 0) return 0;
      scope.push(inArray(webhookDeliveries.webhookId, options.webhookIds));
    }
    if (options.projectId) scope.push(eq(webhooks.projectId, options.projectId));

    const due = db
      .select({ id: webhookDeliveries.id })
      .from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
      .where(and(...scope))
      .orderBy(asc(webhookDeliveries.nextAttemptAt))
      .limit(options.limit ?? 50);
    // Re-checking nextAttemptAt in the UPDATE makes the claim atomic: a
    // concurrent runner that selected the same ids updates nothing.
    const claimed = await db
      .update(webhookDeliveries)
      .set({ nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS) })
      .where(and(inArray(webhookDeliveries.id, due), lte(webhookDeliveries.nextAttemptAt, now)))
      .returning({
        id: webhookDeliveries.id,
        webhookId: webhookDeliveries.webhookId,
        attempt: webhookDeliveries.attempt,
        payload: webhookDeliveries.payload,
        createdAt: webhookDeliveries.createdAt,
      });
    if (claimed.length === 0) return 0;

    const hooks = await db
      .select({ id: webhooks.id, url: webhooks.url, secret: webhooks.secret })
      .from(webhooks)
      .where(inArray(webhooks.id, [...new Set(claimed.map((c) => c.webhookId))]));
    await Promise.all(
      hooks.map((hook) =>
        sendBatch(
          hook,
          claimed
            .filter((c) => c.webhookId === hook.id)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        ),
      ),
    );
    return claimed.length;
  } catch (err) {
    console.error('[webhooks] retry failed', err);
    return 0;
  }
}

/** Drop finished log rows older than the retention window. */
export async function pruneDeliveries(now = new Date()): Promise<number> {
  const rows = await db
    .delete(webhookDeliveries)
    .where(
      and(
        isNull(webhookDeliveries.nextAttemptAt),
        lt(webhookDeliveries.createdAt, new Date(now.getTime() - RETENTION_MS)),
      ),
    )
    .returning({ id: webhookDeliveries.id });
  return rows.length;
}

// ---------------------------------------------------------------------------
// Manual sends (settings UI) — callers authorize and scope the webhook first.
// ---------------------------------------------------------------------------

/** Send + log a one-off delivery (tests are never retried). */
export async function sendLoggedDelivery(
  hook: WebhookTarget,
  payload: WebhookPayload,
  { retry }: { retry: boolean },
): Promise<DeliveryRow> {
  const result = await sendWebhook(hook, payload, 1);
  const now = Date.now();
  const [row] = await db.batch([
    db
      .insert(webhookDeliveries)
      .values({
        id: crypto.randomUUID(),
        webhookId: hook.id,
        eventType: payload.type,
        payload: payload as unknown as Record<string, unknown>,
        createdAt: new Date(now),
        ...attemptUpdate(1, result, retry, now),
      })
      .returning(),
    touchWebhook(hook.id, result.status, now),
  ]);
  return row[0];
}

/** Resend a logged delivery now as its next attempt (resets a given-up row's schedule). */
export async function redeliver(hook: WebhookTarget, delivery: DeliveryRow): Promise<DeliveryRow> {
  const attempt = delivery.attempt + 1;
  const result = await sendWebhook(hook, delivery.payload as unknown as WebhookPayload, attempt);
  const now = Date.now();
  const retry = delivery.eventType !== 'webhook.test';
  const [rows] = await db.batch([
    db
      .update(webhookDeliveries)
      .set(attemptUpdate(attempt, result, retry, now))
      .where(eq(webhookDeliveries.id, delivery.id))
      .returning(),
    touchWebhook(hook.id, result.status, now),
  ]);
  return rows[0] ?? delivery;
}

/** The newest deliveries of a webhook (caller authorizes). */
export async function recentDeliveries(webhookId: string, limit = 20): Promise<DeliveryRow[]> {
  return db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}
