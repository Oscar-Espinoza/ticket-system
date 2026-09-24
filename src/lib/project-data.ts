// Everything a project's pages share (header, pickers, grouping, filters),
// loaded ONCE per request by the project layout in a single neon-http batch.
//
// Authorization is in the SQL: the project row is inner-joined on the viewer's
// membership and every other query is gated by an EXISTS on it, so a
// non-member reads nothing and gets null (the getProjectsForUser pattern).

import { cache } from 'react';
import { and, asc, desc, eq, exists, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import {
  cycles,
  epics,
  labels,
  milestones,
  projectMembers,
  projects,
  users,
  workflowStates,
} from '@/db/schema';
import { isEstimateScale } from '@/lib/estimates';
import { sortStates } from '@/lib/workflow';
import type { EpicSummary, ProjectData } from '@/lib/project-data-types';

export type * from '@/lib/project-data-types';

export const getProjectData = cache(
  async (projectId: string, userId: string): Promise<ProjectData | null> => {
    if (!projectId || !userId) return null;
    const viewer = alias(projectMembers, 'viewer');
    const isMember = exists(
      db
        .select({ one: sql`1` })
        .from(viewer)
        .where(and(eq(viewer.projectId, projectId), eq(viewer.userId, userId))),
    );

    const [projectRows, stateRows, labelRows, memberRows, cycleRows, epicRows, milestoneRows] =
      await db.batch([
        db
          .select({
            id: projects.id,
            name: projects.name,
            ticketKey: projects.ticketKey,
            description: projects.description,
            role: projectMembers.role,
            estimateScale: projects.estimateScale,
            cyclesEnabled: projects.cyclesEnabled,
            triageEnabled: projects.triageEnabled,
            githubRepo: projects.githubRepo,
            workspaceId: projects.workspaceId,
          })
          .from(projectMembers)
          .innerJoin(projects, eq(projectMembers.projectId, projects.id))
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
          .limit(1),
        db
          .select({
            id: workflowStates.id,
            name: workflowStates.name,
            type: workflowStates.type,
            color: workflowStates.color,
            position: workflowStates.position,
            description: workflowStates.description,
          })
          .from(workflowStates)
          .where(and(eq(workflowStates.projectId, projectId), isMember)),
        db
          .select({
            id: labels.id,
            name: labels.name,
            color: labels.color,
            description: labels.description,
          })
          .from(labels)
          .where(and(eq(labels.projectId, projectId), isMember))
          .orderBy(asc(labels.name)),
        db
          .select({
            id: users.id,
            name: users.name,
            image: users.image,
            role: projectMembers.role,
          })
          .from(projectMembers)
          .innerJoin(users, eq(projectMembers.userId, users.id))
          .where(and(eq(projectMembers.projectId, projectId), isMember))
          .orderBy(asc(users.name)),
        db
          .select({
            id: cycles.id,
            number: cycles.number,
            name: cycles.name,
            startsAt: cycles.startsAt,
            endsAt: cycles.endsAt,
            completedAt: cycles.completedAt,
          })
          .from(cycles)
          .where(and(eq(cycles.projectId, projectId), isMember))
          .orderBy(desc(cycles.number)),
        db
          .select({
            id: epics.id,
            name: epics.name,
            color: epics.color,
            status: epics.status,
          })
          .from(epics)
          .where(and(eq(epics.projectId, projectId), isNull(epics.archivedAt), isMember))
          .orderBy(asc(epics.sortOrder), asc(epics.name)),
        db
          .select({ id: milestones.id, name: milestones.name, epicId: milestones.epicId })
          .from(milestones)
          .innerJoin(epics, eq(milestones.epicId, epics.id))
          .where(and(eq(epics.projectId, projectId), isNull(epics.archivedAt), isMember))
          .orderBy(asc(milestones.sortOrder), asc(milestones.name)),
      ]);

    const [project] = projectRows;
    if (!project) return null;
    const viewerMember = memberRows.find((m) => m.id === userId);
    if (!viewerMember) return null;

    const epicsById = new Map<string, EpicSummary>(
      epicRows.map((epic) => [epic.id, { ...epic, milestones: [] }]),
    );
    for (const { epicId, ...milestone } of milestoneRows) {
      epicsById.get(epicId)?.milestones.push(milestone);
    }

    return {
      project: {
        ...project,
        estimateScale: isEstimateScale(project.estimateScale) ? project.estimateScale : 'none',
      },
      states: sortStates(stateRows),
      labels: labelRows,
      members: memberRows,
      cycles: cycleRows,
      epics: [...epicsById.values()],
      viewer: viewerMember,
    };
  },
);
