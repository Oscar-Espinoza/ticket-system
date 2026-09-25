// Initiative reads (server-only). Initiatives are workspace-scoped: every
// query is gated in SQL by the viewer's workspace membership, and epics are
// only ever read from projects the viewer is a member of — so progress and
// linked epics never reveal projects the viewer can't open.

import { cache } from 'react';
import { and, asc, eq, exists, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import {
  epics,
  initiatives,
  milestones,
  projectMembers,
  projects,
  tickets,
  users,
  workspaceMembers,
} from '@/db/schema';
import { epicProgressQuery, selectEpics, toEpicRow, viewerIsMember } from '@/lib/epics';
import { roleAllows } from '@/lib/roles';
import { EMPTY_PROGRESS, addProgress, type Progress } from '@/components/epics/epic-model';
import {
  toInitiativeStatus,
  type InitiativeDetail,
  type InitiativeRow,
} from '@/components/initiatives/initiative-model';

const ownerUsers = alias(users, 'owner');

function workspaceMember(workspaceId: string, userId: string): SQL {
  const viewer = alias(workspaceMembers, 'ws_viewer');
  return exists(
    db
      .select({ one: sql`1` })
      .from(viewer)
      .where(and(eq(viewer.workspaceId, workspaceId), eq(viewer.userId, userId))),
  );
}

function selectInitiatives(where: SQL | undefined) {
  return db
    .select({
      id: initiatives.id,
      workspaceId: initiatives.workspaceId,
      name: initiatives.name,
      description: initiatives.description,
      status: initiatives.status,
      targetDate: initiatives.targetDate,
      createdAt: initiatives.createdAt,
      updatedAt: initiatives.updatedAt,
      ownerId: ownerUsers.id,
      ownerName: ownerUsers.name,
      ownerImage: ownerUsers.image,
    })
    .from(initiatives)
    .leftJoin(ownerUsers, eq(initiatives.ownerId, ownerUsers.id))
    .where(where)
    .orderBy(asc(initiatives.name));
}

type InitiativeSelectRow = Awaited<ReturnType<typeof selectInitiatives>>[number];

function toInitiativeRow(
  row: InitiativeSelectRow,
  epicCount: number,
  progress: Progress,
): InitiativeRow {
  const { ownerId, ownerName, ownerImage, status, ...rest } = row;
  return {
    ...rest,
    status: toInitiativeStatus(status),
    owner: ownerId ? { id: ownerId, name: ownerName ?? '', image: ownerImage } : null,
    epicCount,
    progress,
  };
}

/** Visible, non-archived epics linked to `initiativeWhere`'s initiatives. */
function visibleEpics(userId: string) {
  return and(isNull(epics.archivedAt), viewerIsMember(epics.projectId, userId))!;
}

/** The workspace's initiatives with rolled-up progress; [] for non-members. */
export const getWorkspaceInitiatives = cache(
  async (workspaceId: string, userId: string): Promise<InitiativeRow[]> => {
    if (!workspaceId || !userId) return [];
    const inWorkspace = and(
      eq(initiatives.workspaceId, workspaceId),
      workspaceMember(workspaceId, userId),
    );
    const workspaceInitiativeIds = db
      .select({ id: initiatives.id })
      .from(initiatives)
      .where(inWorkspace);
    const linkedEpicIds = db
      .select({ id: epics.id })
      .from(epics)
      .where(and(inArray(epics.initiativeId, workspaceInitiativeIds), visibleEpics(userId)));

    const [rows, epicRows, progressRows] = await db.batch([
      selectInitiatives(inWorkspace),
      db
        .select({ id: epics.id, initiativeId: epics.initiativeId })
        .from(epics)
        .where(and(inArray(epics.initiativeId, workspaceInitiativeIds), visibleEpics(userId))),
      epicProgressQuery(
        and(inArray(tickets.epicId, linkedEpicIds), viewerIsMember(tickets.projectId, userId)),
      ),
    ]);

    const progressByEpic = new Map(progressRows.map(({ key, ...p }) => [key, p]));
    const rollup = new Map<string, { count: number; progress: Progress }>();
    for (const epic of epicRows) {
      if (!epic.initiativeId) continue;
      const entry = rollup.get(epic.initiativeId) ?? { count: 0, progress: EMPTY_PROGRESS };
      rollup.set(epic.initiativeId, {
        count: entry.count + 1,
        progress: addProgress(entry.progress, progressByEpic.get(epic.id) ?? EMPTY_PROGRESS),
      });
    }
    return rows.map((row) => {
      const entry = rollup.get(row.id);
      return toInitiativeRow(row, entry?.count ?? 0, entry?.progress ?? EMPTY_PROGRESS);
    });
  },
);

/** One initiative with its visible epics, candidates and the workspace's members. */
export const getInitiativeDetail = cache(
  async (
    workspaceId: string,
    initiativeId: string,
    userId: string,
  ): Promise<InitiativeDetail | null> => {
    if (!workspaceId || !initiativeId || !userId) return null;
    const isWorkspaceMember = workspaceMember(workspaceId, userId);
    const linked = and(eq(epics.initiativeId, initiativeId), visibleEpics(userId));
    const linkedEpicIds = db.select({ id: epics.id }).from(epics).where(linked);

    const [rows, epicRows, progressRows, milestoneRows, projectRows, candidateRows, memberRows] =
      await db.batch([
        selectInitiatives(
          and(
            eq(initiatives.id, initiativeId),
            eq(initiatives.workspaceId, workspaceId),
            isWorkspaceMember,
          ),
        ),
        selectEpics(linked),
        epicProgressQuery(
          and(inArray(tickets.epicId, linkedEpicIds), viewerIsMember(tickets.projectId, userId)),
        ),
        db
          .select({
            id: milestones.id,
            epicId: milestones.epicId,
            name: milestones.name,
            description: milestones.description,
            targetDate: milestones.targetDate,
            sortOrder: milestones.sortOrder,
          })
          .from(milestones)
          .where(inArray(milestones.epicId, linkedEpicIds))
          .orderBy(asc(milestones.sortOrder)),
        // The viewer's projects (names for linked epics + edit rights).
        db
          .select({
            id: projects.id,
            name: projects.name,
            ticketKey: projects.ticketKey,
            role: projectMembers.role,
          })
          .from(projectMembers)
          .innerJoin(projects, eq(projectMembers.projectId, projects.id))
          .where(eq(projectMembers.userId, userId)),
        db
          .select({
            id: epics.id,
            name: epics.name,
            color: epics.color,
            projectId: epics.projectId,
            initiativeId: epics.initiativeId,
          })
          .from(epics)
          .innerJoin(projects, eq(epics.projectId, projects.id))
          .where(
            and(
              eq(projects.workspaceId, workspaceId),
              visibleEpics(userId),
              or(isNull(epics.initiativeId), ne(epics.initiativeId, initiativeId)),
              isWorkspaceMember,
            ),
          )
          .orderBy(asc(epics.name)),
        db
          .select({ id: users.id, name: users.name, image: users.image })
          .from(workspaceMembers)
          .innerJoin(users, eq(workspaceMembers.userId, users.id))
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), isWorkspaceMember))
          .orderBy(asc(users.name)),
      ]);

    const [row] = rows;
    if (!row) return null;
    const projectById = new Map(projectRows.map((p) => [p.id, p]));
    const progress = new Map(progressRows.map(({ key, ...p }) => [key, p]));
    const epicList = epicRows.flatMap((epicRow) => {
      const project = projectById.get(epicRow.projectId);
      if (!project) return [];
      return [
        {
          ...toEpicRow(epicRow, progress),
          projectName: project.name,
          projectKey: project.ticketKey,
          canEdit: roleAllows(project.role, 'write'),
        },
      ];
    });
    const total = epicList.reduce((sum, epic) => addProgress(sum, epic.progress), EMPTY_PROGRESS);

    return {
      initiative: toInitiativeRow(row, epicList.length, total),
      epics: epicList,
      milestones: milestoneRows.map((m) => ({ ...m, progress: EMPTY_PROGRESS })),
      candidates: candidateRows.flatMap((epic) => {
        const project = projectById.get(epic.projectId);
        if (!project || !roleAllows(project.role, 'write')) return [];
        return [{ ...epic, projectKey: project.ticketKey }];
      }),
      members: memberRows,
    };
  },
);

/** Initiative choices for an epic's sidebar; caller checks workspace membership. */
export async function getInitiativeOptions(workspaceId: string) {
  return db
    .select({ id: initiatives.id, name: initiatives.name, status: initiatives.status })
    .from(initiatives)
    .where(eq(initiatives.workspaceId, workspaceId))
    .orderBy(asc(initiatives.name));
}

/** The workspace's members (owner picker); caller checks workspace membership. */
export async function getWorkspaceMemberUsers(workspaceId: string) {
  return db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(users.name));
}
