// Dashboard reads. Server-only; every read is scoped to the viewer:
// - visible = own dashboards (still a member of their project, if any) +
//   dashboards shared into a project the viewer belongs to;
// - the dataset only covers projects the viewer is a member of.

import { cache } from 'react';
import { and, desc, eq, exists, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import { customerRequests, customers, dashboards, projectMembers, projects, tickets, users } from '@/db/schema';
import {
  normalizeWidgets,
  type DashboardDataset,
  type DashboardRecord,
} from '@/components/dashboards/widget-model';
import { getProjectData } from '@/lib/project-data';
import type { ProjectData } from '@/lib/project-data-types';
import { memberOfIssueProject, queryIssues } from '@/lib/tickets';

/** Cross-project dashboards cover at most this many projects / issues. */
const MAX_PROJECTS = 25;
const MAX_ISSUES = 5000;

export interface DashboardSummary {
  id: string;
  name: string;
  description: string | null;
  projectId: string | null;
  projectName: string | null;
  shared: boolean;
  ownerName: string | null;
  isOwner: boolean;
  widgetCount: number;
  updatedAt: Date;
}

/** SQL: the viewer may see this dashboard row. */
export function dashboardVisibleTo(userId: string): SQL {
  const member = alias(projectMembers, 'dashboard_member');
  const isMember = exists(
    db
      .select({ one: sql`1` })
      .from(member)
      .where(and(eq(member.projectId, dashboards.projectId), eq(member.userId, userId))),
  );
  return or(
    and(eq(dashboards.ownerId, userId), or(isNull(dashboards.projectId), isMember)),
    and(eq(dashboards.shared, true), isNotNull(dashboards.projectId), isMember),
  )!;
}

const owner = alias(users, 'dashboard_owner');

export async function getVisibleDashboards(userId: string): Promise<DashboardSummary[]> {
  const rows = await db
    .select({
      id: dashboards.id,
      name: dashboards.name,
      description: dashboards.description,
      projectId: dashboards.projectId,
      projectName: projects.name,
      shared: dashboards.shared,
      ownerId: dashboards.ownerId,
      ownerName: owner.name,
      widgetCount: sql<number>`coalesce(jsonb_array_length(${dashboards.widgets}), 0)::int`,
      updatedAt: dashboards.updatedAt,
    })
    .from(dashboards)
    .leftJoin(projects, eq(dashboards.projectId, projects.id))
    .leftJoin(owner, eq(dashboards.ownerId, owner.id))
    .where(dashboardVisibleTo(userId))
    .orderBy(desc(dashboards.updatedAt))
    .limit(200);
  return rows.map(({ ownerId, ...row }) => ({
    ...row,
    isOwner: ownerId === userId,
    widgetCount: Number(row.widgetCount),
  }));
}

export const getDashboardForViewer = cache(
  async (dashboardId: string, userId: string): Promise<DashboardRecord | null> => {
    if (!dashboardId || !userId) return null;
    const [row] = await db
      .select({
        id: dashboards.id,
        name: dashboards.name,
        description: dashboards.description,
        projectId: dashboards.projectId,
        projectName: projects.name,
        shared: dashboards.shared,
        ownerId: dashboards.ownerId,
        ownerName: owner.name,
        widgets: dashboards.widgets,
        updatedAt: dashboards.updatedAt,
      })
      .from(dashboards)
      .leftJoin(projects, eq(dashboards.projectId, projects.id))
      .leftJoin(owner, eq(dashboards.ownerId, owner.id))
      .where(and(eq(dashboards.id, dashboardId), dashboardVisibleTo(userId)))
      .limit(1);
    if (!row) return null;
    return { ...row, widgets: normalizeWidgets(row.widgets) };
  },
);

/**
 * Everything the widgets compute from: the scoped projects' data (states,
 * labels, members, cycles, epics), their non-deleted issues (archived kept for
 * history; descriptions dropped to keep the payload small) and customer links.
 */
export async function getDashboardDataset(projectId: string | null, userId: string): Promise<DashboardDataset> {
  const projectIds = projectId
    ? [projectId]
    : (
        await db
          .select({ id: projectMembers.projectId })
          .from(projectMembers)
          .innerJoin(projects, eq(projectMembers.projectId, projects.id))
          .where(eq(projectMembers.userId, userId))
          .orderBy(desc(projects.createdAt))
          .limit(MAX_PROJECTS)
      ).map((p) => p.id);
  const loaded = await Promise.all(projectIds.map((id) => getProjectData(id, userId)));
  const scoped = loaded.filter((p): p is ProjectData => p !== null);
  const ids = scoped.map((p) => p.project.id);
  if (ids.length === 0) {
    return { viewerId: userId, projects: [], issues: [], customerLinks: [], truncated: false };
  }

  const [issues, links] = await Promise.all([
    queryIssues(and(inArray(tickets.projectId, ids), isNull(tickets.deletedAt), memberOfIssueProject(userId)), {
      limit: MAX_ISSUES,
    }),
    db
      .select({
        ticketId: customerRequests.ticketId,
        customerId: customers.id,
        customerName: customers.name,
      })
      .from(customerRequests)
      .innerJoin(customers, eq(customerRequests.customerId, customers.id))
      .where(and(inArray(customerRequests.projectId, ids), isNotNull(customerRequests.ticketId)))
      .limit(MAX_ISSUES),
  ]);

  return {
    viewerId: userId,
    projects: scoped,
    issues: issues.map((issue) => ({ ...issue, description: null })),
    customerLinks: links.flatMap((l) => (l.ticketId ? [{ ...l, ticketId: l.ticketId }] : [])),
    truncated: issues.length >= MAX_ISSUES,
  };
}
