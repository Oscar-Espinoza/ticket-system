// Move an issue (with its sub-issues) to another project. Needs write access
// in BOTH projects; the service re-scopes every id to the source project.

import { and, asc, eq, inArray, ne } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, projects } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { moveIssue } from '@/lib/issue-service';
import { rolesAllowing } from '@/lib/roles';
import { fail, refreshesData, type ActionResult } from '@/lib/server/action-kit';

export interface MoveTarget {
  id: string;
  name: string;
  ticketKey: string;
}

export type MoveTargetsResult = ActionResult<{ projects: MoveTarget[] }>;

export type MoveIssueActionResult = ActionResult<{
  projectId: string;
  key: string;
  fromKey: string;
  moved: number;
  droppedLabels: string[];
}>;

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
        inArray(projectMembers.role, rolesAllowing('write')),
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
  if (!to.ok) return fail("You can't create issues in that project.");
  if (typeof input.id !== 'string' || !input.id) return fail('Issue not found.');

  const result = await moveIssue({ userId: from.userId }, input.projectId, input.id, input.toProjectId);
  if (!result.ok) return fail(result.error);

  refreshesData();
  return {
    ok: true,
    projectId: input.toProjectId,
    key: result.issue.key,
    fromKey: result.fromKey,
    moved: result.moved,
    droppedLabels: result.droppedLabels,
  };
}
