// Server-side workflow-state helpers: the seed rows for a new project and the
// one column list every read of a project's states uses (WorkflowState shape),
// and the SQL form of the open / closed state-type rule.
// Seeds are returned as insert values (not executed) so createProject can put
// them in the same db.batch as the project row — a project never exists
// without states.

import { eq, inArray, notInArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { workflowStates } from '@/db/schema';
import { CLOSED_STATE_TYPES, DEFAULT_WORKFLOW_STATES } from '@/lib/workflow';

/** Select list that yields a `WorkflowState`. */
export const workflowStateColumns = {
  id: workflowStates.id,
  name: workflowStates.name,
  type: workflowStates.type,
  color: workflowStates.color,
  position: workflowStates.position,
  description: workflowStates.description,
};

/** SQL form of `isClosed`: the joined workflow state is completed or canceled. */
export const closedStateType = () => inArray(workflowStates.type, [...CLOSED_STATE_TYPES]);

/** SQL form of `!isClosed`. */
export const openStateType = () => notInArray(workflowStates.type, [...CLOSED_STATE_TYPES]);

/** The project's states (unsorted); a query, so it can join a db.batch or simply be awaited. */
export function projectStatesQuery(projectId: string) {
  return db.select(workflowStateColumns).from(workflowStates).where(eq(workflowStates.projectId, projectId));
}

export function workflowStateInserts(
  projectId: string,
  now: Date = new Date(),
): (typeof workflowStates.$inferInsert)[] {
  return DEFAULT_WORKFLOW_STATES.map((state) => ({
    id: crypto.randomUUID(),
    projectId,
    name: state.name,
    type: state.type,
    color: state.color,
    position: state.position,
    createdAt: now,
  }));
}
