// Seed rows for a new project's default workflow. Returned as insert values
// (not executed) so createProject can put them in the same db.batch as the
// project row — a project never exists without states.

import { workflowStates } from '@/db/schema';
import { DEFAULT_WORKFLOW_STATES } from '@/lib/workflow';

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
