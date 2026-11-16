// Delivery settings: email digest cadence, account-wide push switch and a
// test push. Everything is pinned to the session user.

import { m } from '@/lib/i18n';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pushSubscriptions, userProfiles } from '@/db/schema';
import { pushConfigured, sendPushes } from '@/lib/push';
import { fail, NOT_AUTHENTICATED, refreshesData, type ActionResult } from '@/lib/server/action-kit';
import { isDigestFrequency, type DigestFrequency } from '@/lib/notifications/types';
import { getSession } from '@/lib/session';

export async function updateDeliverySettings(input: {
  digest?: DigestFrequency;
  push?: boolean;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;
  const { digest, push } = input ?? {};
  if (digest !== undefined && !isDigestFrequency(digest)) return fail(m.settings_err_invalid_request());
  if (push !== undefined && typeof push !== 'boolean') return fail(m.settings_err_invalid_request());
  if (digest === undefined && push === undefined) return fail(m.settings_err_invalid_request());

  const now = new Date();
  const set = {
    ...(digest !== undefined ? { digestFrequency: digest } : {}),
    ...(push !== undefined ? { pushNotifications: push } : {}),
  };
  await db
    .insert(userProfiles)
    .values({ userId: session.user.id, ...set, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: userProfiles.userId, set: { ...set, updatedAt: now } });

  refreshesData();
  return { ok: true };
}

/** Pushes to every device of the caller, ignoring the pause switch (it's a test). */
export async function sendTestPush(): Promise<ActionResult<{ sent: number; devices: number }>> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;
  if (!pushConfigured()) return fail(m.settings_err_push_not_configured());

  const subscriptions = await db
    .select({ endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, session.user.id));
  if (subscriptions.length === 0) return fail(m.settings_err_no_devices());

  const { sent } = await sendPushes(
    subscriptions.map((sub) => ({
      ...sub,
      payload: {
        title: m.settings_push_test_title(),
        body: m.settings_push_test_body(),
        url: '/dashboard/settings/notifications',
        tag: 'test',
      },
    })),
  );
  // Devices the push service reported gone were just pruned.
  refreshesData();
  return { ok: true, sent, devices: subscriptions.length };
}
