'use server';

// Delivery settings (D11): email digest cadence, account-wide push switch and a
// test push. Everything is pinned to the session user.

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pushSubscriptions, userProfiles } from '@/db/schema';
import { pushConfigured, sendPushes } from '@/lib/push';
import { isDigestFrequency, type DigestFrequency } from '@/lib/notifications/types';
import { getSession } from '@/lib/session';

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function updateDeliverySettings(input: {
  digest?: DigestFrequency;
  push?: boolean;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.user) return { ok: false, error: 'Not authenticated' };
  const { digest, push } = input ?? {};
  if (digest !== undefined && !isDigestFrequency(digest)) return { ok: false, error: 'Invalid request' };
  if (push !== undefined && typeof push !== 'boolean') return { ok: false, error: 'Invalid request' };
  if (digest === undefined && push === undefined) return { ok: false, error: 'Invalid request' };

  const now = new Date();
  const set = {
    ...(digest !== undefined ? { digestFrequency: digest } : {}),
    ...(push !== undefined ? { pushNotifications: push } : {}),
  };
  await db
    .insert(userProfiles)
    .values({ userId: session.user.id, ...set, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: userProfiles.userId, set: { ...set, updatedAt: now } });

  revalidatePath('/dashboard/settings/notifications');
  return { ok: true };
}

/** Pushes to every device of the caller, ignoring the pause switch (it's a test). */
export async function sendTestPush(): Promise<ActionResult<{ sent: number; devices: number }>> {
  const session = await getSession();
  if (!session?.user) return { ok: false, error: 'Not authenticated' };
  if (!pushConfigured()) return { ok: false, error: 'Push notifications are not configured on this server.' };

  const subscriptions = await db
    .select({ endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, session.user.id));
  if (subscriptions.length === 0) return { ok: false, error: 'No devices are subscribed yet.' };

  const { sent } = await sendPushes(
    subscriptions.map((sub) => ({
      ...sub,
      payload: {
        title: 'Test notification',
        body: 'Push notifications are working on this device.',
        url: '/dashboard/settings/notifications',
        tag: 'test',
      },
    })),
  );
  // Devices the push service reported gone were just pruned.
  revalidatePath('/dashboard/settings/notifications');
  return { ok: true, sent, devices: subscriptions.length };
}
