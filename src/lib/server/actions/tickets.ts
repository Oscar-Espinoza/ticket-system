// Issue server actions: authorize (session + membership + role level) → the
// issue service (validation, write, activity/events) → refresh the page data. The service
// scopes every write by (issue id, project id) and checks every referenced id
// belongs to the project, so ids from another project match nothing.

import { authorizeProjectAction } from '@/lib/action-auth';
import { refreshesData, type ActionResult } from '@/lib/server/action-kit';
import * as issues from '@/lib/issue-service';
import type { IssueField, IssuePatch, IssueRow } from '@/lib/issue-model';

export type TicketActionResult = ActionResult<{ ticket?: IssueRow }, IssueField>;

export type BulkTicketActionResult = ActionResult<{ tickets: IssueRow[] }, IssueField>;

export type CreateTicketInput = issues.CreateIssueInput & {
  projectId: string;
  /** Idempotency key: a client-chosen UUID for the new issue (see CreateIssueOptions.id). */
  clientId?: string;
};

function toResult(result: issues.IssueResult | issues.PurgeResult): TicketActionResult {
  if (!result.ok) return result;
  return 'issue' in result ? { ok: true, ticket: result.issue } : { ok: true };
}

export async function createTicket(input: CreateTicketInput): Promise<TicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const { projectId, clientId, ...fields } = input;
  const result = await issues.createIssue(
    { userId: authz.userId },
    projectId,
    fields,
    clientId === undefined ? undefined : { id: clientId },
  );
  if (result.ok) refreshesData();
  return toResult(result);
}

export async function updateIssue(input: {
  projectId: string;
  id: string;
  patch: IssuePatch;
  /** Set by the collaborative description editor for its own snapshot saves. */
  descriptionSource?: 'collab';
}): Promise<TicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await issues.updateIssueFields(
    { userId: authz.userId },
    input.projectId,
    input.id,
    input.patch,
    input.descriptionSource === 'collab' ? { descriptionSource: 'collab' } : undefined,
  );
  if (result.ok) refreshesData();
  return toResult(result);
}

export async function bulkUpdateIssues(input: {
  projectId: string;
  ids: string[];
  patch: IssuePatch;
}): Promise<BulkTicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await issues.bulkUpdate(
    { userId: authz.userId },
    input.projectId,
    input.ids,
    input.patch,
  );
  if (!result.ok) return result;
  refreshesData();
  return { ok: true, tickets: result.issues };
}

type IssueRef = { projectId: string; id: string };

export async function archiveIssue(input: IssueRef): Promise<TicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await issues.archive({ userId: authz.userId }, input.projectId, input.id);
  if (result.ok) refreshesData();
  return toResult(result);
}

export async function unarchiveIssue(input: IssueRef): Promise<TicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await issues.unarchive({ userId: authz.userId }, input.projectId, input.id);
  if (result.ok) refreshesData();
  return toResult(result);
}

/** Soft delete: moves the issue to the trash (restorable). */
export async function deleteTicket(input: IssueRef): Promise<TicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await issues.softDelete({ userId: authz.userId }, input.projectId, input.id);
  if (result.ok) refreshesData();
  return toResult(result);
}

/** Out of the trash and/or archive, back into the active list. */
export async function restoreIssue(input: IssueRef): Promise<TicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await issues.restore({ userId: authz.userId }, input.projectId, input.id);
  if (result.ok) refreshesData();
  return toResult(result);
}

type IssueRefs = { projectId: string; ids: string[] };

// Batched lifecycle: one authorization, one write batch (≤ BULK_MAX ids).
async function lifecycleMany(
  input: IssueRefs,
  change: typeof issues.archiveMany,
): Promise<BulkTicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await change({ userId: authz.userId }, input.projectId, input.ids);
  if (!result.ok) return result;
  refreshesData();
  return { ok: true, tickets: result.issues };
}

export async function archiveIssues(input: IssueRefs): Promise<BulkTicketActionResult> {
  return lifecycleMany(input, issues.archiveMany);
}

export async function unarchiveIssues(input: IssueRefs): Promise<BulkTicketActionResult> {
  return lifecycleMany(input, issues.unarchiveMany);
}

/** Soft delete several issues (trash, restorable). */
export async function deleteTickets(input: IssueRefs): Promise<BulkTicketActionResult> {
  return lifecycleMany(input, issues.softDeleteMany);
}

export async function restoreIssues(input: IssueRefs): Promise<BulkTicketActionResult> {
  return lifecycleMany(input, issues.restoreMany);
}

/** Permanent delete — project admins only. */
export async function purgeIssue(input: IssueRef): Promise<TicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  const result = await issues.purge({ userId: authz.userId }, input.projectId, input.id);
  if (result.ok) refreshesData();
  return toResult(result);
}

/** The collaborative editor adopted the stored description (see markDescriptionProjected). */
export async function markDescriptionProjected(input: {
  projectId: string;
  id: string;
  markdown: string;
}): Promise<{ ok: boolean }> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return { ok: false };
  return { ok: await issues.markDescriptionProjected(input.projectId, input.id, input.markdown) };
}
