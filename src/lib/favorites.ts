// Favorites reads. Server-only. A favorite is just (user, type, id); access to
// the target is re-checked here on every read, so favorites on things the user
// can no longer see (left the project, issue trashed, view unshared) are
// skipped rather than leaking names.

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import {
  cycles,
  epics,
  favorites,
  initiatives,
  projectMembers,
  projects,
  savedViews,
  tickets,
  workflowStates,
  workspaceMembers,
  workspaces,
} from '@/db/schema';
import type { FavoriteTarget } from '@/lib/favorite-targets';
import { issuePath } from '@/lib/issue-links';
import type { StateType } from '@/lib/issue-model';
import { viewVisibleTo } from '@/lib/views';

export interface SidebarFavorite {
  /** favorite row id */
  id: string;
  targetType: FavoriteTarget;
  targetId: string;
  label: string;
  href: string;
  /** Issues only — drawn with their state glyph. */
  state?: { type: StateType; color: string; name: string };
  /** Epics / projects may carry a color. */
  color?: string | null;
}

const NONE = ['__none__'];

export async function getSidebarFavorites(userId: string): Promise<SidebarFavorite[]> {
  const rows = await db
    .select({
      id: favorites.id,
      targetType: favorites.targetType,
      targetId: favorites.targetId,
    })
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(asc(favorites.sortOrder), asc(favorites.createdAt));
  if (rows.length === 0) return [];

  const idsOf = (type: FavoriteTarget) => {
    const ids = rows.filter((r) => r.targetType === type).map((r) => r.targetId);
    return ids.length ? ids : NONE;
  };
  // Membership via inner join on project_member — the access check.
  const member = (projectId: AnyPgColumn) =>
    and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId));

  const [projectRows, issueRows, viewRows, epicRows, cycleRows, initiativeRows] = await db.batch([
    db
      .select({ id: projects.id, name: projects.name, color: projects.color })
      .from(projects)
      .innerJoin(projectMembers, member(projects.id))
      .where(inArray(projects.id, idsOf('project'))),
    db
      .select({
        id: tickets.id,
        projectId: tickets.projectId,
        number: tickets.ticketNumber,
        title: tickets.title,
        ticketKey: projects.ticketKey,
        stateType: workflowStates.type,
        stateColor: workflowStates.color,
        stateName: workflowStates.name,
      })
      .from(tickets)
      .innerJoin(projects, eq(tickets.projectId, projects.id))
      .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
      .innerJoin(projectMembers, member(tickets.projectId))
      .where(and(inArray(tickets.id, idsOf('issue')), isNull(tickets.deletedAt))),
    db
      .select({ id: savedViews.id, name: savedViews.name, projectId: savedViews.projectId })
      .from(savedViews)
      .where(and(inArray(savedViews.id, idsOf('view')), viewVisibleTo(userId))),
    db
      .select({ id: epics.id, name: epics.name, projectId: epics.projectId, color: epics.color })
      .from(epics)
      .innerJoin(projectMembers, member(epics.projectId))
      .where(inArray(epics.id, idsOf('epic'))),
    db
      .select({
        id: cycles.id,
        name: cycles.name,
        number: cycles.number,
        projectId: cycles.projectId,
      })
      .from(cycles)
      .innerJoin(projectMembers, member(cycles.projectId))
      .where(inArray(cycles.id, idsOf('cycle'))),
    db
      .select({ id: initiatives.id, name: initiatives.name, slug: workspaces.slug })
      .from(initiatives)
      .innerJoin(workspaces, eq(initiatives.workspaceId, workspaces.id))
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, initiatives.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .where(inArray(initiatives.id, idsOf('initiative'))),
  ]);

  const resolved = new Map<string, Omit<SidebarFavorite, 'id'>>();
  const put = (type: FavoriteTarget, id: string, item: Omit<SidebarFavorite, 'id' | 'targetType' | 'targetId'>) =>
    resolved.set(`${type}:${id}`, { targetType: type, targetId: id, ...item });

  for (const p of projectRows) {
    put('project', p.id, { label: p.name, href: `/dashboard/projects/${p.id}`, color: p.color });
  }
  for (const t of issueRows) {
    const key = `${t.ticketKey}-${t.number}`;
    put('issue', t.id, {
      label: `${key} ${t.title}`,
      href: issuePath(t.projectId, key),
      state: { type: t.stateType, color: t.stateColor, name: t.stateName },
    });
  }
  for (const v of viewRows) {
    put('view', v.id, {
      label: v.name,
      href: v.projectId ? `/dashboard/projects/${v.projectId}/views/${v.id}` : `/dashboard/views/${v.id}`,
    });
  }
  for (const e of epicRows) {
    put('epic', e.id, {
      label: e.name,
      href: `/dashboard/projects/${e.projectId}/epics/${e.id}`,
      color: e.color,
    });
  }
  for (const c of cycleRows) {
    put('cycle', c.id, {
      label: c.name || `Cycle ${c.number}`,
      href: `/dashboard/projects/${c.projectId}/cycles/${c.id}`,
    });
  }
  for (const i of initiativeRows) {
    put('initiative', i.id, {
      label: i.name,
      href: `/dashboard/workspaces/${i.slug}/initiatives/${i.id}`,
    });
  }

  return rows.flatMap((row) => {
    const item = resolved.get(`${row.targetType}:${row.targetId}`);
    return item ? [{ id: row.id, ...item }] : [];
  });
}

/** Target ids of `type` the user has starred — for server-rendered star state. */
export async function getFavoritedIds(userId: string, type: FavoriteTarget): Promise<Set<string>> {
  const rows = await db
    .select({ targetId: favorites.targetId })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.targetType, type)));
  return new Set(rows.map((r) => r.targetId));
}
