'use server';

// Follow / unfollow an issue. Any member (guests included) may follow issues
// they can read; the ticket must belong to the authorized project.

import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { issueSubscribers, tickets, users } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import type { IssueUser } from '@/lib/issue-model';
import { ensureSubscribed, unsubscribe } from '@/lib/subscriptions';

export type SubscribersResult =
  | { ok: true; subscribers: IssueUser[]; subscribed: boolean }
  | { ok: false; error: string };

async function ticketInProject(projectId: string, ticketId: unknown) {
  if (typeof ticketId !== 'string' || !ticketId) return false;
  const [row] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.projectId, projectId)))
    .limit(1);
  return row != null;
}

export async function getIssueSubscribers(input: {
  projectId: string;
  ticketId: string;
}): Promise<SubscribersResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  if (typeof input.ticketId !== 'string' || !input.ticketId) {
    return { ok: false, error: 'Issue not found.' };
  }
  // The inner join on the ticket's project scopes the read without a separate check.
  const subscribers = await db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(issueSubscribers)
    .innerJoin(tickets, eq(tickets.id, issueSubscribers.ticketId))
    .innerJoin(users, eq(users.id, issueSubscribers.userId))
    .where(and(eq(issueSubscribers.ticketId, input.ticketId), eq(tickets.projectId, input.projectId)))
    .orderBy(asc(issueSubscribers.createdAt));
  return {
    ok: true,
    subscribers,
    subscribed: subscribers.some((s) => s.id === authz.userId),
  };
}

export async function setSubscribed(input: {
  projectId: string;
  ticketId: string;
  subscribed: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  if (!(await ticketInProject(input.projectId, input.ticketId))) {
    return { ok: false, error: 'Issue not found.' };
  }
  if (input.subscribed) await ensureSubscribed(input.ticketId, [authz.userId]);
  else await unsubscribe(input.ticketId, authz.userId);
  return { ok: true };
}
