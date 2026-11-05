import { apiError, readJsonBody } from '@/lib/api-auth';
import { createIssue, type CreateIssueInput } from '@/lib/issue-service';
import { listProjectIssues } from '@/lib/graphql/issue-list';
import { apiRoute, projectAccess, serializeIssue, serviceError } from '../../../_lib/api';

/**
 * GET /projects/:id/issues — newest number first, cursor = last number seen.
 * Filters: state (id | name | type), assignee (id | me | none), label (id | name),
 * updated_since (ISO date), include_archived (true). Trashed issues never list.
 * Same listing as GraphQL `issues` (src/lib/graphql/issue-list.ts).
 */
export const GET = apiRoute<{ id: string }>(async (req, { userId }, { id }) => {
  const access = await projectAccess(userId, id, 'read');
  if (!access.ok) return access.response;

  const params = new URL(req.url).searchParams;
  const limit = params.get('limit');
  const result = await listProjectIssues(
    userId,
    id,
    {
      state: params.get('state'),
      assignee: params.get('assignee'),
      label: params.get('label'),
      updatedSince: params.get('updated_since'),
      includeArchived: params.get('include_archived') === 'true',
    },
    { limit: limit ? Number(limit) : null, cursor: params.get('cursor') },
  );
  if (!result.ok) return apiError(400, result.error, { field: result.field });
  return Response.json({ issues: result.issues.map(serializeIssue), nextCursor: result.nextCursor });
});

/** POST /projects/:id/issues — body: CreateIssueInput (title required). */
export const POST = apiRoute<{ id: string }>(async (req, { userId }, { id }) => {
  const access = await projectAccess(userId, id, 'write');
  if (!access.ok) return access.response;
  const json = await readJsonBody(req);
  if (!json.ok) return json.response;

  // createIssue validates every field and referenced id against this project.
  const result = await createIssue({ userId }, id, json.body as unknown as CreateIssueInput);
  if (!result.ok) return serviceError(result);
  return Response.json({ issue: serializeIssue(result.issue) }, { status: 201 });
});
