// SLA policy (admin) and the time-in-status history (read). The policy only
// applies to new issues and priority changes (issue service) until an admin
// applies it to open issues here.

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { commitWithEvents } from '@/lib/events';
import { normalizeSlaPolicy, type SlaPolicy, type TimeInState } from '@/lib/sla';
import { readTimeInStatus } from '@/lib/time-in-status';
import { applyPolicyToOpenIssues } from '@/lib/sla-server';
import { fail, refreshesData, type ActionResult } from '@/lib/server/action-kit';

export async function updateSlaPolicy(input: {
  projectId: string;
  policy: SlaPolicy;
}): Promise<ActionResult<{ policy: SlaPolicy }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  const policy = normalizeSlaPolicy(input.policy);
  if (!policy) return fail('SLA targets must be whole hours between 1 and 8760.');

  await commitWithEvents(
    [db.update(projects).set({ slaPolicy: policy, updatedAt: new Date() }).where(eq(projects.id, input.projectId))],
    [
      {
        projectId: input.projectId,
        ticketId: null,
        actorId: authz.userId,
        type: 'project.sla_policy_updated',
        data: { summary: 'updated the SLA policy', policy },
      },
    ],
  );
  refreshesData();
  return { ok: true, policy };
}

/** Apply the saved policy to the project's open issues (see applyPolicyToOpenIssues). */
export async function applySlaPolicyToOpenIssues(input: {
  projectId: string;
}): Promise<ActionResult<{ updated: number }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  const { projectId } = input;

  // Writes its project.sla_policy_applied line in the same statement.
  const updated = await applyPolicyToOpenIssues(projectId, authz.userId);
  if (updated === null) return fail('Project not found.');
  refreshesData();
  return { ok: true, updated };
}

/** Time spent in each workflow state, from the issue's activity history. */
export async function getTimeInStatus(input: {
  projectId: string;
  issueId: string;
}): Promise<ActionResult<{ states: TimeInState[] }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  if (typeof input.issueId !== 'string' || !input.issueId) return fail('Issue not found.');
  const states = await readTimeInStatus(input.projectId, input.issueId);
  return states ? { ok: true, states } : fail('Issue not found.');
}
