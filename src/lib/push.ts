// Web Push delivery (VAPID, self-generated keys — $0). Server-only. Optional:
// with any of the three env vars unset nothing is sent and the settings page
// explains how to configure it.

import { inArray } from 'drizzle-orm';
import { sendNotification, WebPushError, type VapidKeys } from 'web-push';

import { db } from '@/lib/db';
import { pushSubscriptions } from '@/db/schema';

/** What public/sw.js reads from `event.data.json()`. */
export interface PushPayload {
  title: string;
  body?: string;
  /** Relative app path opened on click. */
  url: string;
  /** Same tag replaces the previous notification (one per issue). */
  tag?: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: PushPayload;
}

const TTL_SECONDS = 24 * 60 * 60;
const CONCURRENCY = 10;

export function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

export function pushConfigured(): boolean {
  return !!(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

// Passed per request rather than via setVapidDetails (module-global state).
function vapidDetails(): (VapidKeys & { subject: string }) | null {
  if (!pushConfigured()) return null;
  return {
    subject: process.env.VAPID_SUBJECT!,
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    privateKey: process.env.VAPID_PRIVATE_KEY!,
  };
}

/**
 * Sends each target, removes subscriptions the push service reports gone
 * (404/410) and returns how many were accepted. Never throws.
 */
export async function sendPushes(targets: PushTarget[]): Promise<{ sent: number; failed: number }> {
  const vapid = vapidDetails();
  if (targets.length === 0 || !vapid) return { sent: 0, failed: targets.length };
  let sent = 0;
  let failed = 0;
  const gone = new Set<string>();

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const chunk = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((target) =>
        sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(target.payload),
          { TTL: TTL_SECONDS, vapidDetails: vapid },
        ),
      ),
    );
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sent++;
        return;
      }
      failed++;
      const err = result.reason;
      if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
        gone.add(chunk[index].endpoint);
      } else {
        // Malformed VAPID keys land here too, once per target.
        console.warn('[push] send failed', err instanceof Error ? err.message : err);
      }
    });
  }

  if (gone.size > 0) {
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.endpoint, [...gone]))
      .catch((err) => console.error('[push] pruning subscriptions failed', err));
  }
  return { sent, failed };
}
