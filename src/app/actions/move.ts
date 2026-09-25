'use server';

// Move an issue (with its sub-issues) to another project. Needs write access
// in BOTH projects; the service re-scopes every id to the source project.

import { revalidatePath } from 'next/cache';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, projects } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { moveIssue } from '@/lib/issue-service';

export interface MoveTarget {
  id: string;
  name: string;
  ticketKey: string;
}

export type MoveTargetsResult = { ok: true; projects: MoveTarget[] } | { ok: false; error: string };

export type MoveIssueActionResult =
  | {
      ok: true;
      projectId: string;
      key: string;
      fromKey: string;
      moved: number;
      droppedLabels: string[];
    }
  | { ok: false; error: string };

/** Projects (other than `projectId`) where the viewer may create issues. */
export async function listMoveTargets(projectId: string): Promise<MoveTargetsResult> {
  const auth = await authorizeProjectAction(projectId, 'write');
  if (!auth.ok) return auth;
  const rows = await db
    .select({ id: projects.id, name: projects.name, ticketKey: projects.ticketKey })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(
      and(
        eq(projectMembers.userId, auth.userId),
        inArray(projectMembers.role, ['owner', 'admin', 'member']),
        ne(projects.id, projectId),
      ),
    )
    .orderBy(asc(projects.name));
  return { ok: true, projects: rows };
}

export async function moveIssueToProject(input: {
  projectId: string;
  id: string;
  toProjectId: string;
}): Promise<MoveIssueActionResult> {
  const from = await authorizeProjectAction(input?.projectId, 'write');
  if (!from.ok) return from;
  const to = await authorizeProjectAction(input.toProjectId, 'write');
  if (!to.ok) return { ok: false, error: "You can't create issues in that project." };
  if (typeof input.id !== 'string' || !input.id) return { ok: false, error: 'Issue not found.' };

  const result = await moveIssue({ userId: from.userId }, input.projectId, input.id, input.toProjectId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/dashboard/projects/${input.projectId}`, 'layout');
  revalidatePath(`/dashboard/projects/${input.toProjectId}`, 'layout');
  return {
    ok: true,
    projectId: input.toProjectId,
    key: result.issue.key,
    fromKey: result.fromKey,
    moved: result.moved,
    droppedLabels: result.droppedLabels,
  };
}
