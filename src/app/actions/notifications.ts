'use server';

// Inbox, notification preferences and reminders. Every notification query is
// pinned to the session user (`userId = me`), so client-supplied ids can only
// ever touch the caller's own rows. Reminders additionally authorize read
// access to the issue's project.

import { revalidatePath } from 'next/cache';
import { and, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { notifications, projects, tickets, userProfiles } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { sendEmail } from '@/lib/email';
import { settingsUrl, testEmail } from '@/lib/notifications/email-templates';
import { countUnreadNotifications, visibleNotification } from '@/lib/notifications/inbox';
import { NOTIFICATION_PREFS } from '@/lib/notifications/types';
import { getSession } from '@/lib/session';

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_IDS = 500;
const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

async function sessionUser() {
  const session = await getSession();
  return session?.user ?? null;
}

function idList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IDS) return null;
  if (!value.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64)) return null;
  return [...new Set(value as string[])];
}

/** A future instant (ISO string) at most a year ahead, or null when invalid. */
function futureDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return null;
  const now = Date.now();
  // A minute of slack for clock skew between browser and server.
  if (ms < now - 60_000 || ms > now + MAX_AHEAD_MS) return null;
  return date;
}

const NOT_AUTHENTICATED = { ok: false, error: 'Not authenticated' } as const;
const INVALID = { ok: false, error: 'Invalid request' } as const;

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export async function getUnreadNotificationCount(): Promise<number> {
  const user = await sessionUser();
  if (!user) return 0;
  return countUnreadNotifications(user.id);
}

export async function markNotificationsRead(input: {
  ids: string[];
  read: boolean;
}): Promise<ActionResult> {
  const user = await sessionUser();
  if (!user) return NOT_AUTHENTICATED;
  const ids = idList(input?.ids);
  if (!ids || typeof input.read !== 'boolean') return INVALID;

  await db
    .update(notifications)
    .set({ readAt: input.read ? new Date() : null })
    .where(and(eq(notifications.userId, user.id), inArray(notifications.id, ids)));
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const user = await sessionUser();
  if (!user) return NOT_AUTHENTICATED;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(visibleNotification(user.id), isNull(notifications.readAt)));
  return { ok: true };
}

export async function archiveNotifications(input: {
  ids: string[];
  archived: boolean;
}): Promise<ActionResult> {
  const user = await sessionUser();
  if (!user) return NOT_AUTHENTICATED;
  const ids = idList(input?.ids);
  if (!ids || typeof input.archived !== 'boolean') return INVALID;

  await db
    .update(notifications)
    .set({ archivedAt: input.archived ? new Date() : null })
    .where(and(eq(notifications.userId, user.id), inArray(notifications.id, ids)));
  return { ok: true };
}

export async function archiveReadNotifications(): Promise<ActionResult<{ count: number }>> {
  const user = await sessionUser();
  if (!user) return NOT_AUTHENTICATED;
  const archived = await db
    .update(notifications)
    .set({ archivedAt: new Date() })
    .where(and(visibleNotification(user.id), isNotNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return { ok: true, count: archived.length };
}

/** Hide until `until` (ISO); it comes back unread. `until: null` un-snoozes. */
export async function snoozeNotifications(input: {
  ids: string[];
  until: string | null;
}): Promise<ActionResult> {
  const user = await sessionUser();
  if (!user) return NOT_AUTHENTICATED;
  const ids = idList(input?.ids);
  const until = input?.until === null ? null : futureDate(input?.until);
  if (!ids || (input.until !== null && !until)) return INVALID;

  await db
    .update(notifications)
    .set(until ? { snoozedUntil: until, readAt: null } : { snoozedUntil: null })
    .where(and(eq(notifications.userId, user.id), inArray(notifications.id, ids)));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

const PREF_TYPES = new Set<string>(NOTIFICATION_PREFS.map((pref) => pref.type));

export async function updateNotificationPrefs(input: {
  email?: boolean;
  prefs?: Record<string, boolean>;
}): Promise<ActionResult> {
  const user = await sessionUser();
  if (!user) return NOT_AUTHENTICATED;

  const email = input?.email;
  if (email !== undefined && typeof email !== 'boolean') return INVALID;
  const prefs: Record<string, boolean> = {};
  for (const [type, on] of Object.entries(input?.prefs ?? {})) {
    if (!PREF_TYPES.has(type) || typeof on !== 'boolean') return INVALID;
    prefs[type] = on;
  }

  const now = new Date();
  await db
    .insert(userProfiles)
    .values({
      userId: user.id,
      emailNotifications: email ?? true,
      notificationPrefs: prefs,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: {
        ...(email !== undefined ? { emailNotifications: email } : {}),
        // Merge, so concurrent toggles of different types don't clobber each other.
        notificationPrefs: sql`${userProfiles.notificationPrefs} || ${JSON.stringify(prefs)}::jsonb`,
        updatedAt: now,
      },
    });

  revalidatePath('/dashboard/settings/notifications');
  return { ok: true };
}

export async function sendTestEmail(): Promise<ActionResult<{ delivered: boolean }>> {
  const user = await sessionUser();
  if (!user) return NOT_AUTHENTICATED;
  const message = testEmail(user.name || 'there', settingsUrl());
  const delivered = await sendEmail({ to: user.email, ...message });
  return { ok: true, delivered };
}

// ---------------------------------------------------------------------------
// Reminders ("Remind me" on an issue)
// ---------------------------------------------------------------------------

/** The issue's key/title, or null when it isn't in that project. */
async function issueInProject(projectId: string, ticketId: unknown) {
  if (typeof ticketId !== 'string' || !ticketId) return null;
  const [row] = await db
    .select({ id: tickets.id, number: tickets.ticketNumber, title: tickets.title, prefix: projects.ticketKey })
    .from(tickets)
    .innerJoin(projects, eq(tickets.projectId, projects.id))
    .where(and(eq(tickets.id, ticketId), eq(tickets.projectId, projectId)))
    .limit(1);
  return row ? { id: row.id, key: `${row.prefix}-${row.number}`, title: row.title } : null;
}

function pendingReminder(userId: string, ticketId: string) {
  return and(
    eq(notifications.userId, userId),
    eq(notifications.ticketId, ticketId),
    eq(notifications.type, 'reminder'),
    isNull(notifications.archivedAt),
    gt(notifications.snoozedUntil, new Date()),
  );
}

type ReminderInput = { projectId: string; ticketId: string };

export async function getIssueReminder(
  input: ReminderInput,
): Promise<ActionResult<{ remindAt: string | null }>> {
  const auth = await authorizeProjectAction(input?.projectId, 'read');
  if (!auth.ok) return auth;
  if (typeof input.ticketId !== 'string' || !input.ticketId) return INVALID;

  // Rows are the caller's own and carry the project id, so no ticket lookup is needed.
  const [row] = await db
    .select({ at: notifications.snoozedUntil })
    .from(notifications)
    .where(and(pendingReminder(auth.userId, input.ticketId), eq(notifications.projectId, input.projectId)))
    .orderBy(notifications.snoozedUntil)
    .limit(1);
  return { ok: true, remindAt: row?.at?.toISOString() ?? null };
}

export async function setIssueReminder(
  input: ReminderInput & { remindAt: string },
): Promise<ActionResult<{ remindAt: string }>> {
  const auth = await authorizeProjectAction(input?.projectId, 'read');
  if (!auth.ok) return auth;
  const remindAt = futureDate(input.remindAt);
  if (!remindAt) return { ok: false, error: 'Pick a time in the future.' };
  const issue = await issueInProject(input.projectId, input.ticketId);
  if (!issue) return { ok: false, error: 'Issue not found' };

  // One pending reminder per issue: setting a new time replaces it.
  await db.batch([
    db.delete(notifications).where(pendingReminder(auth.userId, issue.id)),
    db.insert(notifications).values({
      id: crypto.randomUUID(),
      userId: auth.userId,
      projectId: input.projectId,
      ticketId: issue.id,
      actorId: null,
      type: 'reminder',
      data: { key: issue.key, title: issue.title },
      snoozedUntil: remindAt,
      createdAt: new Date(),
    }),
  ]);
  return { ok: true, remindAt: remindAt.toISOString() };
}

export async function cancelIssueReminder(input: ReminderInput): Promise<ActionResult> {
  const auth = await authorizeProjectAction(input?.projectId, 'read');
  if (!auth.ok) return auth;
  if (typeof input.ticketId !== 'string' || !input.ticketId) return INVALID;
  await db.delete(notifications).where(pendingReminder(auth.userId, input.ticketId));
  return { ok: true };
}
