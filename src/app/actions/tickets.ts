'use server';

// Issue server actions: authorize (session + membership + role level) → the
// issue service (validation, write, activity/events) → revalidate. The service
// scopes every write by (issue id, project id) and checks every referenced id
// belongs to the project, so ids from another project match nothing.

import { revalidatePath } from 'next/cache';

import { authorizeProjectAction } from '@/lib/action-auth';
import * as issues from '@/lib/issue-service';
import type { IssueField, IssuePatch, IssueRow } from '@/lib/issue-model';

export type TicketActionResult =
  | { ok: true; ticket?: IssueRow }
  | { ok: false; error: string; field?: IssueField };

export type BulkTicketActionResult =
  | { ok: true; tickets: IssueRow[] }
  | { ok: false; error: string; field?: IssueField };

export type CreateTicketInput = issues.CreateIssueInput & { projectId: string };

function revalidateProject(projectId: string) {
  // 'layout': every page under the project (issues, views, cycles, …).
  revalidatePath(`/dashboard/projects/${projectId}`, 'layout');
  // Sidebar / project list open-resolved counts.
  revalidatePath('/dashboard');
}

function toResult(result: issues.IssueResult | issues.PurgeResult): TicketActionResult {
  if (!result.ok) return result;
  return 'issue' in result ? { ok: true, ticket: result.issue } : { ok: true };
}

export async function createTicket(input: CreateTicketInput): Promise<TicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const { projectId, ...fields } = input;
  const result = await issues.createIssue({ userId: authz.userId }, projectId, fields);
  if (result.ok) revalidateProject(projectId);
  return toResult(result);
}

export async function updateIssue(input: {
  projectId: string;
  id: string;
  patch: IssuePatch;
}): Promise<TicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await issues.updateIssueFields(
    { userId: authz.userId },
    input.projectId,
    input.id,
    input.patch,
  );
  if (result.ok) revalidateProject(input.projectId);
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
  revalidateProject(input.projectId);
  return { ok: true, tickets: result.issues };
}

type IssueRef = { projectId: string; id: string };

export async function archiveIssue(input: IssueRef): Promise<TicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await issues.archive({ userId: authz.userId }, input.projectId, input.id);
  if (result.ok) revalidateProject(input.projectId);
  return toResult(result);
}

export async function unarchiveIssue(input: IssueRef): Promise<TicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await issues.unarchive({ userId: authz.userId }, input.projectId, input.id);
  if (result.ok) revalidateProject(input.projectId);
  return toResult(result);
}

/** Soft delete: moves the issue to the trash (restorable). */
export async function deleteTicket(input: IssueRef): Promise<TicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await issues.softDelete({ userId: authz.userId }, input.projectId, input.id);
  if (result.ok) revalidateProject(input.projectId);
  return toResult(result);
}

/** Out of the trash and/or archive, back into the active list. */
export async function restoreIssue(input: IssueRef): Promise<TicketActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await issues.restore({ userId: authz.userId }, input.projectId, input.id);
  if (result.ok) revalidateProject(input.projectId);
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
  revalidateProject(input.projectId);
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
  if (result.ok) revalidateProject(input.projectId);
  return toResult(result);
}
