// Triage actions (write level): accept, decline, mark duplicate. Each checks
// the issue belongs to the project AND is still in a triage state, so a stale
// click (someone else already triaged it) is an error instead of a silent move.
// State changes go through the issue service; the extra triage events carry a
// `summary` for the activity timeline and notifications.

import { asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { labels, projectMembers, users } from '@/db/schema';
import { loadProjectStates } from '@/lib/workflow-server';
import { authorizeProjectAction } from '@/lib/action-auth';
import { emitIssueEvent } from '@/lib/events';
import { updateIssueFields } from '@/lib/issue-service';
import type { IssuePatch, IssueRow, Priority, WorkflowState } from '@/lib/issue-model';
import { isPriority } from '@/lib/issue-model';
import { stripMentions } from '@/lib/mentions';
import { fail, refreshesData, type ActionResult } from '@/lib/server/action-kit';
import { createIssueRelation } from '@/lib/relations';
import { findSimilarIssues } from '@/lib/similarity';
import { getTicketById } from '@/lib/tickets';
import {
  TRIAGE_REASON_MAX,
  acceptStates,
  declineState,
  suggestTriage,
  type TriageSuggestions,
} from '@/lib/triage';

export type TriageActionResult = ActionResult<{ warning?: string }>;

async function loadStates(projectId: string): Promise<WorkflowState[]> {
  return loadProjectStates(projectId);
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
  if ('error' in found) return fail(found.error);

  const states = await loadStates(input.projectId);
  if (!acceptStates(states).some((s) => s.id === input.stateId)) {
    return fail('Pick an open workflow state.');
  }
  const patch: IssuePatch = { stateId: input.stateId };
  if (input.priority !== undefined) {
    if (!isPriority(input.priority)) return fail('Invalid priority.');
    patch.priority = input.priority;
  }
  // Membership of the assignee is validated by the issue service.
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;

  const result = await updateIssueFields({ userId: authz.userId }, input.projectId, found.issue.id, patch);
  if (!result.ok) return fail(result.error);
  refreshesData();
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
  if ('error' in found) return fail(found.error);
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length > TRIAGE_REASON_MAX) {
    return fail(`Keep the reason under ${TRIAGE_REASON_MAX} characters.`);
  }

  const target = declineState(await loadStates(input.projectId));
  if (!target) return fail('This project has no canceled state.');
  const { issue } = found;
  const result = await updateIssueFields({ userId: authz.userId }, input.projectId, issue.id, {
    stateId: target.id,
  });
  if (!result.ok) return fail(result.error);

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
  refreshesData();
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
  if ('error' in found) return fail(found.error);
  if (typeof input.originalId !== 'string' || !input.originalId) {
    return fail('Pick the original issue.');
  }
  if (input.originalId === found.issue.id) {
    return fail("An issue can't duplicate itself.");
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
  refreshesData();
  return result;
}

export type TriageSuggestionsResult = ActionResult<{ suggestions: TriageSuggestions }>;

/** How many similar issues vote on the suggestions. */
const SUGGESTION_NEIGHBORS = 8;

/**
 * Heuristic suggestions (labels, assignee, priority, likely duplicate) for a
 * triage issue, voted by its most similar issues. Read level: anyone who can
 * see the queue sees them; applying goes through the normal write actions.
 */
export async function getTriageSuggestions(input: {
  projectId: string;
  id: string;
}): Promise<TriageSuggestionsResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  const found = await triageIssue(input.projectId, input.id);
  if ('error' in found) return fail(found.error);
  const { issue } = found;

  const [similar, [projectLabels, members]] = await Promise.all([
    findSimilarIssues(authz.userId, input.projectId, {
      title: issue.title,
      description: issue.description ? stripMentions(issue.description) : null,
      excludeIds: [issue.id],
      limit: SUGGESTION_NEIGHBORS,
      minScore: 0.25,
    }),
    db.batch([
      db
        .select({ id: labels.id, name: labels.name, color: labels.color })
        .from(labels)
        .where(eq(labels.projectId, input.projectId))
        .orderBy(asc(labels.name)),
      db
        .select({ id: users.id, name: users.name, image: users.image })
        .from(projectMembers)
        .innerJoin(users, eq(projectMembers.userId, users.id))
        .where(eq(projectMembers.projectId, input.projectId)),
    ]),
  ]);

  return {
    ok: true,
    suggestions: suggestTriage(issue, similar, { labels: projectLabels, members }),
  };
}
