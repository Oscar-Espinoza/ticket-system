// Issue relation actions: authorize (session + membership + role) → the
// relations DAL (which scopes every id to the project) → refresh the page data.

import { authorizeProjectAction } from '@/lib/action-auth';
import {
  createIssueRelation,
  deleteIssueRelation,
  readIssueRelations,
  type AddableRelationKind,
  type GetRelationsResult,
  type RelationResult,
} from '@/lib/relations';
import { refreshesData } from '@/lib/server/action-kit';

export type { GetRelationsResult };

export async function getIssueRelations(input: {
  projectId: string;
  ticketId: string;
}): Promise<GetRelationsResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  return readIssueRelations(input.projectId, input.ticketId);
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
