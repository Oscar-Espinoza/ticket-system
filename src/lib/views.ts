// Saved views — reads and the visibility rule. Server-only.
//
// A view is visible to its owner and, when shared, to every member of its
// project — but only while the viewer is still a member of that project.
// Views without a project (reserved for cross-project views) are owner-only.

import { cache } from 'react';
import { and, asc, desc, eq, exists, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import { projectMembers, projects, savedViews, users } from '@/db/schema';

export interface SavedViewSummary {
  id: string;
  name: string;
  description: string | null;
  projectId: string | null;
  projectName: string | null;
  shared: boolean;
  ownerId: string;
  ownerName: string | null;
  isOwner: boolean;
  updatedAt: Date;
}

export interface SavedViewDetail extends SavedViewSummary {
  filters: Record<string, unknown>;
  display: Record<string, unknown>;
}

/** SQL predicate over `saved_view`: `userId` may see the row. */
export function viewVisibleTo(userId: string): SQL {
  const viewer = alias(projectMembers, 'view_viewer');
  return or(
    and(isNull(savedViews.projectId), eq(savedViews.ownerId, userId)),
    and(
      or(eq(savedViews.ownerId, userId), eq(savedViews.shared, true)),
      exists(
        db
          .select({ one: sql`1` })
          .from(viewer)
          .where(and(eq(viewer.projectId, savedViews.projectId), eq(viewer.userId, userId))),
      ),
    ),
  )!;
}

function selectViews() {
  return db
    .select({
      id: savedViews.id,
      name: savedViews.name,
      description: savedViews.description,
      projectId: savedViews.projectId,
      projectName: projects.name,
      shared: savedViews.shared,
      ownerId: savedViews.ownerId,
      ownerName: users.name,
      updatedAt: savedViews.updatedAt,
      filters: savedViews.filters,
      display: savedViews.display,
    })
    .from(savedViews)
    .leftJoin(projects, eq(savedViews.projectId, projects.id))
    .leftJoin(users, eq(savedViews.ownerId, users.id))
    .$dynamic();
}

type ViewRow = Awaited<ReturnType<ReturnType<typeof selectViews>['execute']>>[number];

function toDetail(row: ViewRow, userId: string): SavedViewDetail {
  return { ...row, isOwner: row.ownerId === userId };
}

/** Views the user can see — all of them, or one project's. Own views first. */
export async function getVisibleViews(
  userId: string,
  projectId?: string,
): Promise<SavedViewSummary[]> {
  const rows = await selectViews()
    .where(
      and(viewVisibleTo(userId), projectId ? eq(savedViews.projectId, projectId) : undefined),
    )
    .orderBy(
      desc(sql`${savedViews.ownerId} = ${userId}`),
      asc(projects.name),
      asc(savedViews.name),
    );
  // Summaries don't need the (possibly large) filter/display JSON on the client.
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    projectId: row.projectId,
    projectName: row.projectName,
    shared: row.shared,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    isOwner: row.ownerId === userId,
    updatedAt: row.updatedAt,
  }));
}

/** One view if `userId` may see it. Memoized per request (metadata + page). */
export const getViewForUser = cache(
  async (viewId: string, userId: string): Promise<SavedViewDetail | null> => {
    if (!viewId || !userId) return null;
    const [row] = await selectViews()
      .where(and(eq(savedViews.id, viewId), viewVisibleTo(userId)))
      .limit(1);
    return row ? toDetail(row, userId) : null;
  },
);
