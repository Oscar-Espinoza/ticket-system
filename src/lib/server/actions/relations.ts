// Issue relation actions: authorize (session + membership + role) → the
// relations DAL (which scopes every id to the project) → refresh the page data.

import { authorizeProjectAction } from '@/lib/action-auth';
import {
  createIssueRelation,
  deleteIssueRelation,
  listIssueRelations,
  type AddableRelationKind,
  type IssueRelationView,
  type RelationResult,
} from '@/lib/relations';
import { fail, refreshesData, type ActionResult } from '@/lib/server/action-kit';

export type GetRelationsResult = ActionResult<{ relations: IssueRelationView[] }>;

export async function getIssueRelations(input: {
  projectId: string;
  ticketId: string;
}): Promise<GetRelationsResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  if (typeof input.ticketId !== 'string' || !input.ticketId) return fail('Issue not found.');
  return { ok: true, relations: await listIssueRelations(input.projectId, input.ticketId) };
}

export async function addIssueRelation(input: {
  projectId: string;
  ticketId: string;
  relatedTicketId: string;
  kind: AddableRelationKind;
}): Promise<RelationResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await createIssueRelation(authz.userId, input.projectId, input);
  if (result.ok) refreshesData();
  return result;
}

export async function removeIssueRelation(input: {
  projectId: string;
  relationId: string;
}): Promise<RelationResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const result = await deleteIssueRelation(authz.userId, input.projectId, input.relationId);
  if (result.ok) refreshesData();
  return result;
}
