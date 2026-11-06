// The one way notifications get created: checks the recipient's per-type
// preference, inserts the inbox rows, then delivers to the channels the type
// uses. Dispatch (issue events), the SLA / pulse / recurring jobs and
// reminders all come through here. Server-only.

import { eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { db } from '@/lib/db';
import { notifications, userProfiles, users } from '@/db/schema';
import { deliverToChannels, type ChannelNotification } from './channels';
import { deliverEmail, type Person } from './channels/email';
import { prefEnabled, type NotificationType } from './types';

interface NotificationRule {
  /** Honour the recipient's per-type switch (and skip recipients that no longer exist). */
  prefs: boolean;
  /** Web Push and the Slack DM. */
  channels: boolean;
  /** Immediate email (users in digest mode still wait for the digest). */
  email: boolean;
}

const WITH_EMAIL: NotificationRule = { prefs: true, channels: true, email: true };
const NO_EMAIL: NotificationRule = { prefs: true, channels: true, email: false };

/** What each type does today; adding a type to NOTIFICATION_TYPES forces a decision here. */
const RULES: Record<NotificationType, NotificationRule> = {
  assigned: WITH_EMAIL,
  mentioned: WITH_EMAIL,
  commented: WITH_EMAIL,
  status_changed: WITH_EMAIL,
  completed: WITH_EMAIL,
  github: WITH_EMAIL,
  sla_breached: NO_EMAIL,
  recurring_created: NO_EMAIL,
  pulse: NO_EMAIL,
  // Self-set and surfaced when due: no switch, no push or email at creation.
  reminder: { prefs: false, channels: false, email: false },
};

const ruleFor = (type: string): NotificationRule => RULES[type as NotificationType] ?? NO_EMAIL;

/** Rows per INSERT; the statements of one call share a transaction. */
const CHUNK = 500;

export interface CreateNotificationsOptions {
  /** Runs in the same transaction, before the insert (a new reminder replaces its predecessor). */
  replacing?: BatchItem<'pg'>;
}

type Recipient = Person & { prefs: Record<string, boolean> | null };

async function loadRecipients(ids: string[]): Promise<Map<string, Recipient>> {
  const people = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailNotifications: userProfiles.emailNotifications,
      digestFrequency: userProfiles.digestFrequency,
      prefs: userProfiles.notificationPrefs,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(inArray(users.id, ids));
  return new Map(people.map((person) => [person.id, person]));
}

/** Returns the rows that were inserted (those the recipients' preferences allowed). */
export async function createNotifications(
  rows: ChannelNotification[],
  options: CreateNotificationsOptions = {},
): Promise<ChannelNotification[]> {
  const needsPeople = rows.some((row) => ruleFor(row.type).prefs || ruleFor(row.type).email);
  const emailsAny = rows.some((row) => ruleFor(row.type).email);
  const ids = new Set<string>();
  if (needsPeople) {
    for (const row of rows) {
      ids.add(row.userId);
      if (emailsAny && row.actorId) ids.add(row.actorId);
    }
  }
  const people = ids.size ? await loadRecipients([...ids]) : new Map<string, Recipient>();

  const accepted = rows.filter((row) => {
    if (!ruleFor(row.type).prefs) return true;
    const person = people.get(row.userId);
    return !!person && prefEnabled(person.prefs, row.type);
  });

  const statements: BatchItem<'pg'>[] = options.replacing ? [options.replacing] : [];
  for (let i = 0; i < accepted.length; i += CHUNK) {
    statements.push(db.insert(notifications).values(accepted.slice(i, i + CHUNK)));
  }
  if (statements.length === 0) return [];
  await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]]);
  if (accepted.length === 0) return [];

  await Promise.allSettled([
    deliverEmail(
      accepted.filter((row) => ruleFor(row.type).email),
      people,
    ),
    deliverToChannels(accepted.filter((row) => ruleFor(row.type).channels)),
  ]);
  return accepted;
}
