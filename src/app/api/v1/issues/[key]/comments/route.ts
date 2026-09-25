import { apiError, readJsonBody } from '@/lib/api-auth';
import { createCommentAs, loadIssueTimeline } from '@/lib/comments';
import { apiRoute, issueByKey } from '../../../_lib/api';

type Params = { key: string };

/** GET /issues/:key/comments — oldest first; replies carry parentId. */
export const GET = apiRoute<Params>(async (_req, { userId }, { key }) => {
  const found = await issueByKey(userId, key, 'read');
  if (!found.ok) return found.response;

  const { comments } = await loadIssueTimeline(found.issue.projectId, found.issue.id);
  return Response.json({ comments });
});

/** POST /issues/:key/comments — body: { body: markdown, parentId? }. */
export const POST = apiRoute<Params>(async (req, { userId }, { key }) => {
  const found = await issueByKey(userId, key, 'comment');
  if (!found.ok) return found.response;
  if (found.issue.deletedAt) return apiError(404, 'Issue not found.');
  const json = await readJsonBody(req);
  if (!json.ok) return json.response;

  // B1's comment service: validates length, scopes the parent to this issue,
  // keeps only member mentions, subscribes, and emits comment.created.
  const result = await createCommentAs({ userId }, found.issue.projectId, {
    ticketId: found.issue.id,
    body: json.body.body,
    parentId: json.body.parentId,
  });
  if (!result.ok) {
    return apiError(result.error === 'Issue not found.' ? 404 : 400, result.error);
  }
  return Response.json({ comment: result.comment }, { status: 201 });
});
