// Daily cron job (D11): email digests for users with user_profile.digestFrequency
// 'daily' or 'weekly' (Mondays UTC, or once 7 days have passed). A digest lists
// the unread, not-yet-emailed notifications since lastDigestAt, grouped by issue.
//
// Idempotent: each user is claimed by moving lastDigestAt with a compare-and-set
// before sending, so a retried or overlapping run can't send twice; the claim is
// rolled back when the email couldn't be sent (retried on the next run).

import { and, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { notifications, projectMembers, userProfiles, users } from '@/db/schema';
import { sendEmail } from '@/lib/email';
import { appUrl } from '@/lib/integrations/app-url';
import { digestEmail, settingsUrl, type DigestGroup } from '@/lib/notifications/email-templates';
import {
  describeNotification,
  notificationData,
  notificationPath,
  prefEnabled,
} from '@/lib/notifications/types';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Cron start times drift by minutes; these margins keep the cadence stable. */
const DAILY_MIN_GAP = 20 * HOUR;
const WEEKLY_MIN_GAP = 7 * DAY - 4 * HOUR;
const MAX_LOOKBACK = 14 * DAY;
/** Resend's free tier allows 100 emails a day; leave room for immediate ones. */
const MAX_EMAILS_PER_RUN = 90;
const MAX_ROWS = 500;
const MAX_LISTED = 50;
const MAX_PER_GROUP = 5;

type Frequency = 'daily' | 'weekly';

interface Recipient {
  userId: string;
  email: string;
  frequency: Frequency;
  last: Date | null;
  prefs: Record<string, boolean>;
}

export function digestDue(frequency: Frequency, last: Date | null, now: Date): boolean {
  const elapsed = last ? now.getTime() - last.getTime() : Infinity;
  if (frequency === 'daily') return elapsed >= DAILY_MIN_GAP;
  // Weekly starts on the next Monday rather than the day it was switched on.
  if (now.getUTCDay() === 1) return elapsed >= DAILY_MIN_GAP;
  return last !== null && elapsed >= WEEKLY_MIN_GAP;
}

export async function run(now: Date): Promise<string> {
  const candidates = await db
    .select({
      userId: userProfiles.userId,
      email: users.email,
      frequency: userProfiles.digestFrequency,
      last: userProfiles.lastDigestAt,
      prefs: userProfiles.notificationPrefs,
    })
    .from(userProfiles)
    .innerJoin(users, eq(users.id, userProfiles.userId))
    .where(
      and(
        inArray(userProfiles.digestFrequency, ['daily', 'weekly']),
        eq(userProfiles.emailNotifications, true),
      ),
    );

  const due = candidates.filter((c): c is Recipient =>
    digestDue(c.frequency as Frequency, c.last, now),
  );

  let sent = 0;
  let empty = 0;
  let failed = 0;
  let deferred = 0;
  // Sequential: the free Resend tier rate-limits bursts.
  for (const recipient of due) {
    if (sent + failed >= MAX_EMAILS_PER_RUN) {
      deferred++;
      continue;
    }
    try {
      const outcome = await sendDigest(recipient, now);
      if (outcome === 'sent') sent++;
      else if (outcome === 'empty') empty++;
      else if (outcome === 'failed') failed++;
    } catch (err) {
      failed++;
      console.error('[digests] digest failed', recipient.userId, err);
    }
  }
  return `due ${due.length}: sent ${sent}, nothing new ${empty}, failed ${failed}, deferred ${deferred}`;
}

async function sendDigest(recipient: Recipient, now: Date): Promise<'sent' | 'empty' | 'failed' | 'claimed'> {
  const { userId, last } = recipient;
  const sameLast = last ? eq(userProfiles.lastDigestAt, last) : isNull(userProfiles.lastDigestAt);

  const claimed = await db
    .update(userProfiles)
    .set({ lastDigestAt: now })
    .where(and(eq(userProfiles.userId, userId), sameLast))
    .returning({ userId: userProfiles.userId });
  if (claimed.length === 0) return 'claimed';

  const period = recipient.frequency === 'daily' ? DAY : 7 * DAY;
  const since = new Date(
    Math.max(last?.getTime() ?? now.getTime() - period, now.getTime() - MAX_LOOKBACK),
  );

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      data: notifications.data,
      projectId: notifications.projectId,
      ticketId: notifications.ticketId,
      createdAt: notifications.createdAt,
      actorName: users.name,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.actorId))
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.archivedAt),
        // Assignments and mentions were already emailed right away.
        isNull(notifications.emailedAt),
        gt(notifications.createdAt, since),
        lte(notifications.createdAt, now),
        or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, now)),
        // Nothing from projects the user has since left.
        or(
          isNull(notifications.projectId),
          inArray(
            notifications.projectId,
            db
              .select({ id: projectMembers.projectId })
              .from(projectMembers)
              .where(eq(projectMembers.userId, userId)),
          ),
        ),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(MAX_ROWS);

  const included = rows.filter((row) => prefEnabled(recipient.prefs, row.type));
  // Nothing new: keep the claim so the cadence holds, send nothing.
  if (included.length === 0) return 'empty';

  const origin = appUrl();
  const groups = new Map<string, DigestGroup>();
  for (const row of included.slice(0, MAX_LISTED)) {
    const data = notificationData(row.data);
    const sentence = describeNotification(row.type, data, row.actorName ?? null);
    const groupKey = row.ticketId ?? row.id;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        key: row.ticketId ? (data.key ?? '') : '',
        title: data.title ?? sentence,
        url: `${origin}${notificationPath(row.projectId, data)}`,
        items: [],
        more: 0,
      };
      groups.set(groupKey, group);
    }
    if (group.items.length < MAX_PER_GROUP) {
      group.items.push({ sentence, at: row.createdAt, excerpt: data.excerpt });
    } else {
      group.more++;
    }
  }

  const message = digestEmail({
    frequency: recipient.frequency,
    groups: [...groups.values()],
    total: included.length,
    inboxUrl: `${origin}/dashboard/inbox`,
    settingsUrl: settingsUrl(),
  });

  if (!(await sendEmail({ to: recipient.email, ...message }))) {
    // Not delivered (provider down / not configured): release the claim.
    await db
      .update(userProfiles)
      .set({ lastDigestAt: last })
      .where(and(eq(userProfiles.userId, userId), eq(userProfiles.lastDigestAt, now)));
    return 'failed';
  }

  await db
    .update(notifications)
    .set({ emailedAt: now })
    .where(
      inArray(
        notifications.id,
        included.map((row) => row.id),
      ),
    );
  return 'sent';
}
