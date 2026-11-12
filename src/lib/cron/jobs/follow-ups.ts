// Daily cron job: tell the assignee when an issue's follow-up date arrives.
//
// An open, active, assigned issue whose `follow_up` is today or earlier (so
// dates that arrived while the cron was down are caught up) and was not yet
// notified for that date is claimed with a conditional update that sets
// `follow_up_notified_on = follow_up`. A rerun the same day, or a retry after a
// crash, finds nothing left to claim, so nobody is notified twice; changing
// `follow_up` to another day re-arms the issue. Like the SLA job, the claim
// commits before the inbox rows: a crash in between loses that notification
// rather than repeating it.
//
// Who: only the assignee, and only while they are still a project member.
// Issues without an assignee are skipped and stay unclaimed, so assigning one
// later notifies the new assignee on the next run. Completed / canceled,
// archived and trashed issues are skipped (unclaimed: reopening re-arms them).
// The follow-up date is left as it is.
//
// "Today" is the server's calendar date (toDateString(now)), the same
// convention as the due-date filters (`due:overdue`) — UTC on Vercel and in
// the Docker image.

import { and, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, projects, tickets, users, workflowStates, type notifications } from '@/db/schema';
import { toDateString } from '@/lib/dates';
import { createNotifications } from '@/lib/notifications/create';
import { formatIssueKey } from '@/lib/tickets';
import { openStateType } from '@/lib/workflow-server';

const BATCH = 500;
/** Safety valve: at most this many batches per run (the next run continues). */
const MAX_BATCHES = 10;

type NotificationInsert = typeof notifications.$inferInsert;

/** Arrived, not yet notified for this date, still live. Matches ticket_follow_up_pending_idx. */
function pending(today: string) {
  return and(
    isNotNull(tickets.followUp),
    lte(tickets.followUp, today),
    sql`${tickets.followUpNotifiedOn} is distinct from ${tickets.followUp}`,
    isNull(tickets.archivedAt),
    isNull(tickets.deletedAt),
    isNotNull(tickets.assigneeId),
  )!;
}

/** Notification summary; the inbox shows it capitalized ("Follow-up date reached — waiting on Ana"). */
export function followUpSummary(waitingOnName: string | null): string {
  return waitingOnName ? `follow-up date reached — waiting on ${waitingOnName}` : 'follow-up date reached';
}

async function notifyBatch(now: Date, today: string): Promise<number> {
  const due = await db
    .select({ id: tickets.id })
    .from(tickets)
    .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
    .where(and(pending(today), openStateType()))
    .limit(BATCH);
  if (due.length === 0) return 0;

  const claimed = await db
    .update(tickets)
    .set({ followUpNotifiedOn: sql`${tickets.followUp}` })
    .where(
      and(
        inArray(
          tickets.id,
          due.map((row) => row.id),
        ),
        pending(today),
      ),
    )
    .returning({
      id: tickets.id,
      projectId: tickets.projectId,
      number: tickets.ticketNumber,
      title: tickets.title,
      assigneeId: tickets.assigneeId,
      waitingOnId: tickets.waitingOnId,
      followUp: tickets.followUp,
    });
  if (claimed.length === 0) return 0;

  const projectIds = [...new Set(claimed.map((row) => row.projectId))];
  const waitingOnIds = [...new Set(claimed.map((row) => row.waitingOnId).filter((id): id is string => !!id))];
  const [keyRows, memberRows, waitingRows] = await Promise.all([
    db
      .select({ id: projects.id, key: projects.ticketKey })
      .from(projects)
      .where(inArray(projects.id, projectIds)),
    db
      .select({ projectId: projectMembers.projectId, userId: projectMembers.userId })
      .from(projectMembers)
      .where(inArray(projectMembers.projectId, projectIds)),
    waitingOnIds.length
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, waitingOnIds))
      : Promise.resolve([]),
  ]);
  const keyOf = new Map(keyRows.map((row) => [row.id, row.key]));
  const members = new Set(memberRows.map((row) => `${row.projectId}:${row.userId}`));
  const nameOf = new Map(waitingRows.map((row) => [row.id, row.name]));

  const rows: NotificationInsert[] = [];
  for (const issue of claimed) {
    // Removed members are never notified; their type switch is applied on creation.
    if (!issue.assigneeId || !members.has(`${issue.projectId}:${issue.assigneeId}`)) continue;
    const waitingOn = issue.waitingOnId ? (nameOf.get(issue.waitingOnId) ?? null) : null;
    rows.push({
      id: crypto.randomUUID(),
      userId: issue.assigneeId,
      projectId: issue.projectId,
      ticketId: issue.id,
      actorId: null,
      type: 'follow_up',
      data: {
        key: formatIssueKey(keyOf.get(issue.projectId) ?? '?', issue.number),
        title: issue.title,
        summary: followUpSummary(waitingOn),
      },
      createdAt: now,
    });
  }
  if (rows.length) await createNotifications(rows);
  return claimed.length;
}

export async function run(now: Date): Promise<string> {
  const today = toDateString(now);
  let notified = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const count = await notifyBatch(now, today);
    notified += count;
    if (count < BATCH) break;
  }
  return `${notified} follow-ups due`;
}
