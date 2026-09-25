// Inbox reads. Server-only; every query is scoped to the given user id, which
// callers take from the session — never from client input.

import { and, count, desc, eq, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { notifications, projects, tickets, users } from '@/db/schema';
import type { IssueRow, IssueUser } from '@/lib/issue-model';
import { issueQueries, memberOfIssueProject, mergeIssueRows } from '@/lib/tickets';
import { notificationData, type NotificationData } from './types';

const INBOX_LIMIT = 300;

export interface InboxNotification {
  id: string;
  type: string;
  data: NotificationData;
  projectId: string | null;
  projectName: string | null;
  ticketId: string | null;
  actor: IssueUser | null;
  readAt: Date | null;
  createdAt: Date;
  /** When it (re)entered the inbox: createdAt, or the end of a snooze / reminder time. */
  at: Date;
}

export interface InboxData {
  notifications: InboxNotification[];
  /** Issues the viewer can still see, for the detail pane. */
  issues: IssueRow[];
}

/** In the inbox now: not archived and not snoozed into the future. */
export function visibleNotification(userId: string, now = new Date()): SQL {
  return and(
    eq(notifications.userId, userId),
    isNull(notifications.archivedAt),
    or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, now)),
  )!;
}

const effectiveAt = sql<Date>`greatest(${notifications.createdAt}, coalesce(${notifications.snoozedUntil}, ${notifications.createdAt}))`;

export async function getInbox(userId: string): Promise<InboxData> {
  const now = new Date();
  const visible = visibleNotification(userId, now);

  const listQuery = db
    .select({
      id: notifications.id,
      type: notifications.type,
      data: notifications.data,
      projectId: notifications.projectId,
      projectName: projects.name,
      ticketId: notifications.ticketId,
      actorId: users.id,
      actorName: users.name,
      actorImage: users.image,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      snoozedUntil: notifications.snoozedUntil,
    })
    .from(notifications)
    .leftJoin(projects, eq(notifications.projectId, projects.id))
    .leftJoin(users, eq(notifications.actorId, users.id))
    .where(visible)
    .orderBy(desc(effectiveAt), desc(notifications.createdAt))
    .limit(INBOX_LIMIT);

  // Issue details only while the viewer is still a member of the issue's project.
  const issueWhere = and(
    inArray(
      tickets.id,
      db.select({ id: notifications.ticketId }).from(notifications).where(visible),
    ),
    memberOfIssueProject(userId),
  );
  const [rows, issueRows, labelRows] = await db.batch([listQuery, ...issueQueries(issueWhere)]);

  return {
    notifications: rows.map((row) => {
      const snoozed = row.snoozedUntil && row.snoozedUntil > row.createdAt ? row.snoozedUntil : null;
      return {
        id: row.id,
        type: row.type,
        data: notificationData(row.data),
        projectId: row.projectId,
        projectName: row.projectName,
        ticketId: row.ticketId,
        actor: row.actorId
          ? { id: row.actorId, name: row.actorName ?? '', image: row.actorImage }
          : null,
        readAt: row.readAt,
        createdAt: row.createdAt,
        at: snoozed ?? row.createdAt,
      };
    }),
    issues: mergeIssueRows(issueRows, labelRows),
  };
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(visibleNotification(userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}
