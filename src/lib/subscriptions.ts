// Issue subscriptions (follow issue). Server-only: callers authorize first.
// Shared by comments (commenters + mentions auto-subscribe) and notification
// dispatch (creator + assignee auto-subscribe, recipient lookup).

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { issueSubscribers } from '@/db/schema';

/** Idempotently subscribes each user; ignores ids already subscribed. */
export async function ensureSubscribed(ticketId: string, userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  const now = new Date();
  try {
    await db
      .insert(issueSubscribers)
      .values(ids.map((userId) => ({ ticketId, userId, createdAt: now })))
      .onConflictDoNothing();
  } catch (err) {
    // The issue (or a user) was purged between the event and this deferred
    // fan-out: nothing left to subscribe to.
    const code = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
    if (code !== '23503') throw err;
  }
}

export async function unsubscribe(ticketId: string, userId: string) {
  await db
    .delete(issueSubscribers)
    .where(and(eq(issueSubscribers.ticketId, ticketId), eq(issueSubscribers.userId, userId)));
}

export async function getSubscriberIds(ticketId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: issueSubscribers.userId })
    .from(issueSubscribers)
    .where(eq(issueSubscribers.ticketId, ticketId));
  return rows.map((row) => row.userId);
}

/** Subscriber ids for many tickets at once (notification fan-out). */
export async function getSubscriberIdsByTicket(
  ticketIds: string[],
): Promise<Map<string, string[]>> {
  const byTicket = new Map<string, string[]>();
  if (ticketIds.length === 0) return byTicket;
  const rows = await db
    .select({ ticketId: issueSubscribers.ticketId, userId: issueSubscribers.userId })
    .from(issueSubscribers)
    .where(inArray(issueSubscribers.ticketId, ticketIds));
  for (const row of rows) {
    const list = byTicket.get(row.ticketId) ?? [];
    list.push(row.userId);
    byTicket.set(row.ticketId, list);
  }
  return byTicket;
}

export async function isSubscribed(ticketId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: issueSubscribers.userId })
    .from(issueSubscribers)
    .where(and(eq(issueSubscribers.ticketId, ticketId), eq(issueSubscribers.userId, userId)))
    .limit(1);
  return row != null;
}
