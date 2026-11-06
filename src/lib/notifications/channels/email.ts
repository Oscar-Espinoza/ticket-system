// Email channel: one message per recipient per batch, so a bulk edit is one
// email, not twenty. Digest subscribers only get the types that can't wait for
// the daily digest job, which emails the rest (rows without emailedAt).

import { inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { notifications } from '@/db/schema';
import { appUrl } from '@/lib/integrations/app-url';
import { issuePath } from '@/lib/issue-links';
import { sendEmail } from '@/lib/email';
import { notificationEmail, settingsUrl, type EmailItem } from '@/lib/notifications/email-templates';
import { DIGEST_IMMEDIATE_TYPES, describeNotification, type NotificationData } from '@/lib/notifications/types';

import type { ChannelNotification } from './index';

export interface Person {
  id: string;
  name: string;
  email: string;
  emailNotifications: boolean | null;
  digestFrequency: string | null;
}

export async function deliverEmail(rows: ChannelNotification[], personById: Map<string, Person>) {
  const byUser = new Map<string, ChannelNotification[]>();
  for (const row of rows) {
    const person = personById.get(row.userId);
    // No profile row yet = defaults = email on.
    if (!person || person.emailNotifications === false) continue;
    const digest = person.digestFrequency && person.digestFrequency !== 'off';
    if (digest && !DIGEST_IMMEDIATE_TYPES.has(row.type)) continue;
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }
  if (byUser.size === 0) return;

  const origin = appUrl();
  const settings = settingsUrl();
  const emailed: string[] = [];

  // Sequential: the free Resend tier rate-limits bursts.
  for (const [userId, list] of byUser) {
    const person = personById.get(userId)!;
    const items: EmailItem[] = list.map((row) => {
      const data = (row.data ?? {}) as NotificationData;
      const actor = row.actorId ? (personById.get(row.actorId)?.name ?? null) : null;
      const key = data.key ?? '';
      return {
        sentence: describeNotification(row.type, data, actor),
        key,
        title: data.title ?? '',
        url: row.projectId && key ? `${origin}${issuePath(row.projectId, key)}` : `${origin}/dashboard/inbox`,
        excerpt: data.excerpt,
      };
    });
    const message = notificationEmail(items, settings);
    if (await sendEmail({ to: person.email, ...message })) {
      emailed.push(...list.map((row) => row.id));
    }
  }

  if (emailed.length > 0) {
    await db
      .update(notifications)
      .set({ emailedAt: new Date() })
      .where(inArray(notifications.id, emailed));
  }
}
