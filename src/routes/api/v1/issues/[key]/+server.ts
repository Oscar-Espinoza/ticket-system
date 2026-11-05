import { readJsonBody } from '@/lib/api-auth';
import { softDelete, updateIssueFields } from '@/lib/issue-service';
import type { IssuePatch } from '@/lib/issue-model';
import { apiRoute, issueByKey, serializeIssue, serviceError } from '../../_lib/api';

type Params = { key: string };

/** GET /issues/:key — archived and trashed issues included (see archivedAt / deletedAt). */
export const GET = apiRoute<Params>(async (_req, { userId }, { key }) => {
  const found = await issueByKey(userId, key, 'read');
  if (!found.ok) return found.response;
  return Response.json({ issue: serializeIssue(found.issue) });
});

/** PATCH /issues/:key — body: IssuePatch (absent = untouched, null = clear). */
export const PATCH = apiRoute<Params>(async (req, { userId }, { key }) => {
  const found = await issueByKey(userId, key, 'write');
  if (!found.ok) return found.response;
  const json = await readJsonBody(req);
  if (!json.ok) return json.response;

  const { issue } = found;
  const result = await updateIssueFields(
    { userId },
    issue.projectId,
    issue.id,
    json.body as IssuePatch,
  );
  if (!result.ok) return serviceError(result);
  return Response.json({ issue: serializeIssue(result.issue) });
});

/** DELETE /issues/:key — moves the issue to the trash (restorable in the app). */
export const DELETE = apiRoute<Params>(async (_req, { userId }, { key }) => {
  const found = await issueByKey(userId, key, 'write');
  if (!found.ok) return found.response;

  const { issue } = found;
  const result = await softDelete({ userId }, issue.projectId, issue.id);
  if (!result.ok) return serviceError(result);
  return Response.json({ issue: serializeIssue(result.issue) });
});
