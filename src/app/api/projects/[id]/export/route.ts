// Export every non-deleted issue of a project (archived included) as CSV or JSON.
// Members only (any role); non-members get 404 so project ids can't be probed.

import type { NextRequest } from 'next/server';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { cycles, epics, milestones, projects, tickets, users } from '@/db/schema';
import { toCsv } from '@/lib/import/csv';
import { PRIORITY_LABEL, STATE_TYPE_LABEL } from '@/lib/issue-model';
import { formatEstimate } from '@/lib/estimates';
import { getMemberProject } from '@/lib/project-access';
import { getSession } from '@/lib/session';
import { issueQueries, mergeIssueRows } from '@/lib/tickets';

const iso = (date: Date | null) => (date ? date.toISOString() : null);

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([ctx.params, getSession()]);
  if (!session?.user) return new Response('Not authenticated', { status: 401 });
  const member = await getMemberProject(id, session.user.id);
  if (!member) return new Response('Not found', { status: 404 });

  const format = request.nextUrl.searchParams.get('format') === 'json' ? 'json' : 'csv';
  const inProject = eq(tickets.projectId, id);
  const people = db
    .select({ id: tickets.assigneeId })
    .from(tickets)
    .where(inProject)
    .union(db.select({ id: tickets.creatorId }).from(tickets).where(inProject));

  const [rows, labelRows, userRows, cycleRows, epicRows, milestoneRows, numberRows, projectRows] =
    await db.batch([
      ...issueQueries(and(inProject, isNull(tickets.deletedAt)), {
        orderBy: [asc(tickets.ticketNumber)],
      }),
      db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, people)),
      db
        .select({ id: cycles.id, number: cycles.number, name: cycles.name })
        .from(cycles)
        .where(eq(cycles.projectId, id)),
      db.select({ id: epics.id, name: epics.name }).from(epics).where(eq(epics.projectId, id)),
      db
        .select({ id: milestones.id, name: milestones.name })
        .from(milestones)
        .innerJoin(epics, eq(milestones.epicId, epics.id))
        .where(eq(epics.projectId, id)),
      // Parent keys: parents may be in the trash, so read every number.
      db
        .select({ id: tickets.id, number: tickets.ticketNumber })
        .from(tickets)
        .where(inProject),
      db
        .select({ estimateScale: projects.estimateScale })
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1),
    ]);

  const issues = mergeIssueRows(rows, labelRows);
  const email = new Map(userRows.map((u) => [u.id, u.email]));
  const cycleName = new Map(cycleRows.map((c) => [c.id, c.name || `Cycle ${c.number}`]));
  const epicName = new Map(epicRows.map((e) => [e.id, e.name]));
  const milestoneName = new Map(milestoneRows.map((m) => [m.id, m.name]));
  const parentKey = new Map(numberRows.map((t) => [t.id, `${member.ticketKey}-${t.number}`]));
  const scale = projectRows[0]?.estimateScale ?? 'none';

  const records = issues.map((issue) => ({
    id: issue.key,
    title: issue.title,
    description: issue.description,
    status: issue.state.name,
    statusType: STATE_TYPE_LABEL[issue.state.type],
    priority: PRIORITY_LABEL[issue.priority],
    assignee: issue.assignee?.name ?? null,
    assigneeEmail: (issue.assignee && email.get(issue.assignee.id)) ?? null,
    creator: issue.creator?.name ?? null,
    creatorEmail: (issue.creator && email.get(issue.creator.id)) ?? null,
    labels: issue.labels.map((l) => l.name),
    estimate: issue.estimate,
    estimateLabel: issue.estimate === null ? null : formatEstimate(scale, issue.estimate),
    dueDate: issue.dueDate,
    cycle: (issue.cycleId && cycleName.get(issue.cycleId)) ?? null,
    epic: (issue.epicId && epicName.get(issue.epicId)) ?? null,
    milestone: (issue.milestoneId && milestoneName.get(issue.milestoneId)) ?? null,
    parent: (issue.parentId && parentKey.get(issue.parentId)) ?? null,
    createdAt: iso(issue.createdAt),
    updatedAt: iso(issue.updatedAt),
    startedAt: iso(issue.startedAt),
    completedAt: iso(issue.completedAt),
    canceledAt: iso(issue.canceledAt),
    archivedAt: iso(issue.archivedAt),
  }));

  const date = new Date().toISOString().slice(0, 10);
  const filename = `${member.ticketKey}-issues-${date}.${format}`;
  const headers = {
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  };

  if (format === 'json') {
    const body = {
      project: { id, name: member.name, key: member.ticketKey },
      exportedAt: new Date().toISOString(),
      issues: records,
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const csv = toCsv([
    [
      'ID',
      'Title',
      'Description',
      'Status',
      'Status Type',
      'Priority',
      'Assignee',
      'Assignee Email',
      'Creator',
      'Creator Email',
      'Labels',
      'Estimate',
      'Due Date',
      'Cycle',
      'Epic',
      'Milestone',
      'Parent',
      'Created',
      'Updated',
      'Started',
      'Completed',
      'Canceled',
      'Archived',
    ],
    ...records.map((r) => [
      r.id,
      r.title,
      r.description,
      r.status,
      r.statusType,
      r.priority,
      r.assignee,
      r.assigneeEmail,
      r.creator,
      r.creatorEmail,
      r.labels.join(', '),
      r.estimateLabel,
      r.dueDate,
      r.cycle,
      r.epic,
      r.milestone,
      r.parent,
      r.createdAt,
      r.updatedAt,
      r.startedAt,
      r.completedAt,
      r.canceledAt,
      r.archivedAt,
    ]),
  ]);
  return new Response(csv, {
    headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' },
  });
}
