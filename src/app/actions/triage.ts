'use server';

// Triage actions (write level): accept, decline, mark duplicate. Each checks
// the issue belongs to the project AND is still in a triage state, so a stale
// click (someone else already triaged it) is an error instead of a silent move.
// State changes go through the issue service; the extra triage events carry a
// `summary` for the activity timeline and notifications.

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { workflowStates } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { emitIssueEvent } from '@/lib/events';
import { updateIssueFields } from '@/lib/issue-service';
import type { IssuePatch, IssueRow, Priority, WorkflowState } from '@/lib/issue-model';
import { isPriority } from '@/lib/issue-model';
import { createIssueRelation } from '@/lib/relations';
import { getTicketById } from '@/lib/tickets';
import { TRIAGE_REASON_MAX, acceptStates, declineState } from '@/lib/triage';

export type TriageActionResult = { ok: true; warning?: string } | { ok: false; error: string };

function revalidateProject(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`, 'layout');
  revalidatePath('/dashboard');
}

async function loadStates(projectId: string): Promise<WorkflowState[]> {
  return db
    .select({
      id: workflowStates.id,
      name: workflowStates.name,
      type: workflowStates.type,
      color: workflowStates.color,
      position: workflowStates.position,
      description: workflowStates.description,
    })
    .from(workflowStates)
    .where(eq(workflowStates.projectId, projectId));
}

/** The issue, if it's in this project, active, and still in triage. */
async function triageIssue(
  projectId: string,
  id: unknown,
): Promise<{ issue: IssueRow } | { error: string }> {
  if (typeof id !== 'string' || !id) return { error: 'Issue not found.' };
  const issue = await getTicketById(projectId, id);
  if (!issue || issue.deletedAt) return { error: 'Issue not found.' };
  if (issue.state.type !== 'triage') return { error: `${issue.key} is no longer in triage.` };
  return { issue };
}

export async function acceptTriageIssue(input: {
  projectId: string;
  id: string;
  stateId: string;
  priority?: Priority;
  assigneeId?: string | null;
}): Promise<TriageActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const found = await triageIssue(input.projectId, input.id);
  if ('error' in found) return { ok: false, error: found.error };

  const states = await loadStates(input.projectId);
  if (!acceptStates(states).some((s) => s.id === input.stateId)) {
    return { ok: false, error: 'Pick an open workflow state.' };
  }
  const patch: IssuePatch = { stateId: input.stateId };
  if (input.priority !== undefined) {
    if (!isPriority(input.priority)) return { ok: false, error: 'Invalid priority.' };
    patch.priority = input.priority;
  }
  // Membership of the assignee is validated by the issue service.
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;

  const result = await updateIssueFields({ userId: authz.userId }, input.projectId, found.issue.id, patch);
  if (!result.ok) return { ok: false, error: result.error };
  revalidateProject(input.projectId);
  return { ok: true };
}

export async function declineTriageIssue(input: {
  projectId: string;
  id: string;
  reason?: string;
}): Promise<TriageActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const found = await triageIssue(input.projectId, input.id);
  if ('error' in found) return { ok: false, error: found.error };
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length > TRIAGE_REASON_MAX) {
    return { ok: false, error: `Keep the reason under ${TRIAGE_REASON_MAX} characters.` };
  }

  const target = declineState(await loadStates(input.projectId));
  if (!target) return { ok: false, error: 'This project has no canceled state.' };
  const { issue } = found;
  const result = await updateIssueFields({ userId: authz.userId }, input.projectId, issue.id, {
    stateId: target.id,
  });
  if (!result.ok) return { ok: false, error: result.error };

  await emitIssueEvent({
    projectId: input.projectId,
    ticketId: issue.id,
    actorId: authz.userId,
    type: 'triage.declined',
    data: {
      key: issue.key,
      title: issue.title,
      summary: reason ? `declined from triage: ${reason}` : 'declined from triage',
      ...(reason ? { reason } : {}),
    },
  });
  revalidateProject(input.projectId);
  return { ok: true };
}

export async function markTriageDuplicate(input: {
  projectId: string;
  id: string;
  originalId: string;
}): Promise<TriageActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const found = await triageIssue(input.projectId, input.id);
  if ('error' in found) return { ok: false, error: found.error };
  if (typeof input.originalId !== 'string' || !input.originalId) {
    return { ok: false, error: 'Pick the original issue.' };
  }
  if (input.originalId === found.issue.id) {
    return { ok: false, error: "An issue can't duplicate itself." };
  }

  // The relation service checks the original is in this project and not
  // trashed, writes relation.created on both issues and moves this one to the
  // "Duplicate" state.
  const result = await createIssueRelation(authz.userId, input.projectId, {
    ticketId: found.issue.id,
    relatedTicketId: input.originalId,
    kind: 'duplicate_of',
  });
  if (!result.ok) return result;
  revalidateProject(input.projectId);
  return result;
}
