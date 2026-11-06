// Web Push channel: one OS notification per new inbox row on every device the
// recipient subscribed, unless they paused push (user_profile.pushNotifications)
// or switched the type off. Never throws.

import { inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pushSubscriptions, userProfiles } from '@/db/schema';
import { pushConfigured, sendPushes, type PushPayload, type PushTarget } from '@/lib/push';
import {
  describeNotification,
  notificationData,
  notificationPath,
  prefEnabled,
} from '@/lib/notifications/types';

import type { ActorNames, ChannelNotification } from './index';

/** A bulk edit shouldn't stack twenty OS notifications: past this, one summary push. */
const MAX_PER_USER = 5;
const BODY_LENGTH = 180;

/** `live` rows are due now (the entry point drops snoozed ones). */
export async function deliverPush(live: ChannelNotification[], actorNames: ActorNames): Promise<void> {
  try {
    if (!pushConfigured()) return;
    const userIds = [...new Set(live.map((row) => row.userId))];

    const [subscriptions, profiles, actorName] = await Promise.all([
      db
        .select({
          userId: pushSubscriptions.userId,
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, userIds)),
      db
        .select({
          userId: userProfiles.userId,
          push: userProfiles.pushNotifications,
          prefs: userProfiles.notificationPrefs,
        })
        .from(userProfiles)
        .where(inArray(userProfiles.userId, userIds)),
      actorNames(),
    ]);
    if (subscriptions.length === 0) return;

    const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));

    const payloadsByUser = new Map<string, PushPayload[]>();
    for (const row of live) {
      // No profile row = defaults = push on, every type on.
      const profile = profileByUser.get(row.userId);
      if (profile && (!profile.push || !prefEnabled(profile.prefs, row.type))) continue;
      const list = payloadsByUser.get(row.userId) ?? [];
      list.push(pushPayload(row, row.actorId ? (actorName.get(row.actorId) ?? null) : null));
      payloadsByUser.set(row.userId, list);
    }

    const targets: PushTarget[] = [];
    for (const [userId, payloads] of payloadsByUser) {
      const capped =
        payloads.length > MAX_PER_USER
          ? [
              ...payloads.slice(0, MAX_PER_USER - 1),
              {
                title: `${payloads.length - MAX_PER_USER + 1} more notifications`,
                body: 'Open your inbox to see them all.',
                url: '/dashboard/inbox',
                tag: 'inbox',
              },
            ]
          : payloads;
      for (const sub of subscriptions) {
        if (sub.userId !== userId) continue;
        for (const payload of capped) targets.push({ ...sub, payload });
      }
    }
    await sendPushes(targets);
  } catch (err) {
    console.error('[push] delivery failed', err);
  }
}

export function pushPayload(row: ChannelNotification, actor: string | null): PushPayload {
  const data = notificationData(row.data);
  const sentence = describeNotification(row.type, data, actor);
  const heading = [data.key, data.title].filter(Boolean).join(' ');
  const lines = Array.isArray(data.lines) ? data.lines.filter((line) => typeof line === 'string') : [];
  const body = data.excerpt ? `${sentence}: “${data.excerpt}”` : sentence;
  return {
    // Issue-less rows (pulse) lead with the sentence instead.
    title: heading || sentence,
    body: heading ? truncate(body) : lines.length ? truncate(lines.join(' · ')) : undefined,
    url: notificationPath(row.projectId, data),
    tag: row.ticketId ?? row.id,
  };
}

function truncate(text: string) {
  return text.length > BODY_LENGTH ? `${text.slice(0, BODY_LENGTH - 1)}…` : text;
}
