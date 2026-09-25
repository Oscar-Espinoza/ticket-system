// My Issues reads. Every query is scoped to projects the viewer is a member of
// (memberOfIssueProject — a correlated EXISTS) and to active issues.

import { and, desc, eq, exists, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { activities, issueSubscribers, tickets } from '@/db/schema';
import type { IssueRow } from '@/lib/issue-model';
import { activeIssue, memberOfIssueProject, queryIssues } from '@/lib/tickets';

export const MY_ISSUES_TABS = [
  { id: 'assigned', label: 'Assigned' },
  { id: 'created', label: 'Created' },
  { id: 'subscribed', label: 'Subscribed' },
  { id: 'activity', label: 'Activity' },
] as const;

export type MyIssuesTab = (typeof MY_ISSUES_TABS)[number]['id'];

export function isMyIssuesTab(value: unknown): value is MyIssuesTab {
  return MY_ISSUES_TABS.some((tab) => tab.id === value);
}

const LIST_LIMIT = 500;
const ACTIVITY_LIMIT = 50;

export interface ActivityIssue {
  issue: IssueRow;
  lastActedAt: Date;
}

export async function getMyIssues(userId: string, tab: Exclude<MyIssuesTab, 'activity'>) {
  const scope = and(activeIssue(), memberOfIssueProject(userId));
  switch (tab) {
    case 'assigned':
      return queryIssues(and(scope, eq(tickets.assigneeId, userId)), { limit: LIST_LIMIT });
    case 'created':
      return queryIssues(and(scope, eq(tickets.creatorId, userId)), { limit: LIST_LIMIT });
    case 'subscribed':
      return queryIssues(
        and(
          scope,
          exists(
            db
              .select({ one: sql`1` })
              .from(issueSubscribers)
              .where(
                and(eq(issueSubscribers.ticketId, tickets.id), eq(issueSubscribers.userId, userId)),
              ),
          ),
        ),
        { limit: LIST_LIMIT },
      );
  }
}

/** Issues the viewer most recently acted on (their own activity rows), newest first. */
export async function getMyRecentActivity(userId: string): Promise<ActivityIssue[]> {
  const lastActed = sql<Date>`(select max(${activities.createdAt}) from ${activities} where ${activities.ticketId} = ${tickets.id} and ${activities.actorId} = ${userId})`;
  const issues = await queryIssues(
    and(
      activeIssue(),
      memberOfIssueProject(userId),
      inArray(
        tickets.id,
        db
          .select({ id: activities.ticketId })
          .from(activities)
          .where(and(eq(activities.actorId, userId), sql`${activities.ticketId} is not null`)),
      ),
    ),
    { orderBy: [desc(lastActed)], limit: ACTIVITY_LIMIT },
  );
  if (issues.length === 0) return [];

  // The correlated max isn't part of IssueRow; fetch it for the rows we got.
  const times = await db
    .select({
      ticketId: activities.ticketId,
      at: sql<Date>`max(${activities.createdAt})`.mapWith(activities.createdAt),
    })
    .from(activities)
    .where(
      and(
        eq(activities.actorId, userId),
        inArray(
          activities.ticketId,
          issues.map((i) => i.id),
        ),
      ),
    )
    .groupBy(activities.ticketId);
  const byTicket = new Map(times.map((t) => [t.ticketId, t.at]));
  return issues.map((issue) => ({
    issue,
    lastActedAt: byTicket.get(issue.id) ?? issue.updatedAt,
  }));
}
