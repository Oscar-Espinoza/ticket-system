// Shared plumbing for the /api/v1 route handlers (the `_lib` folder is private,
// not routed). Every handler goes: API key / OAuth token → user (+ token scope:
// GET needs `read`, writes need `write`) → project membership + role →
// issue-service / reads scoped to that project. Non-members get 404 (the same
// as a missing project, so ids can't be probed); a too-low role gets 403.

import { apiError, authenticateApiRequest, missingScope } from '@/lib/api-auth';
import { ProjectAccessError, requireProjectMember } from '@/lib/project-access';
import { roleAllows, type AccessLevel, type ProjectRole } from '@/lib/roles';
import type { IssueRow } from '@/lib/issue-model';
import type { IssueServiceError } from '@/lib/issue-service';
import { getTicketById } from '@/lib/tickets';
import { resolveIssueKey } from '@/lib/graphql/issue-key';
import { absoluteIssueUrl } from '@/lib/integrations/app-url';

export interface ApiCaller {
  userId: string;
  keyId: string;
}

const READ_METHODS = new Set(['GET', 'HEAD']);

type Handler<P> = (req: Request, caller: ApiCaller, params: P) => Promise<Response>;

/** Authenticate, run, and turn unexpected failures into a JSON 500. */
export function apiRoute<P extends Record<string, string> = Record<string, never>>(
  handler: Handler<P>,
) {
  return async (req: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    const auth = await authenticateApiRequest(req);
    if (!auth.ok) return auth.response;
    const denied = missingScope(auth, READ_METHODS.has(req.method) ? 'read' : 'write');
    if (denied) return denied;
    try {
      return await handler(req, { userId: auth.userId, keyId: auth.keyId }, await ctx.params);
    } catch (err) {
      console.error('[api] request failed', req.method, new URL(req.url).pathname, err);
      return apiError(500, 'Internal server error.');
    }
  };
}

export type Access = { ok: true; role: ProjectRole } | { ok: false; response: Response };

export async function projectAccess(
  userId: string,
  projectId: string,
  level: AccessLevel,
): Promise<Access> {
  try {
    const { role } = await requireProjectMember(projectId, userId);
    if (!roleAllows(role, level)) {
      return {
        ok: false,
        response: apiError(403, `This requires ${level} access to the project.`),
      };
    }
    return { ok: true, role };
  } catch (err) {
    if (err instanceof ProjectAccessError) {
      return { ok: false, response: apiError(404, 'Project not found.') };
    }
    throw err;
  }
}

/** Resolve "APP-12" (or a pre-move alias) to an issue the caller may access at `level`. */
export async function issueByKey(
  userId: string,
  key: string,
  level: AccessLevel,
): Promise<{ ok: true; issue: IssueRow; role: ProjectRole } | { ok: false; response: Response }> {
  const notFound = { ok: false as const, response: apiError(404, 'Issue not found.') };
  const ref = await resolveIssueKey(key);
  if (!ref) return notFound;

  const access = await projectAccess(userId, ref.projectId, level);
  if (!access.ok) {
    // Hide which keys exist from non-members.
    return access.response.status === 404 ? notFound : access;
  }
  const issue = await getTicketById(ref.projectId, ref.id);
  return issue ? { ok: true, issue, role: access.role } : notFound;
}

/** Public JSON shape of an issue (stable subset of IssueRow + permalink). */
export function serializeIssue(issue: IssueRow) {
  return {
    id: issue.id,
    key: issue.key,
    number: issue.number,
    projectId: issue.projectId,
    title: issue.title,
    description: issue.description,
    state: { id: issue.state.id, name: issue.state.name, type: issue.state.type },
    priority: issue.priority,
    estimate: issue.estimate,
    startDate: issue.startDate,
    dueDate: issue.dueDate,
    assignee: issue.assignee,
    creator: issue.creator,
    labels: issue.labels,
    parentId: issue.parentId,
    cycleId: issue.cycleId,
    epicId: issue.epicId,
    milestoneId: issue.milestoneId,
    startedAt: issue.startedAt,
    completedAt: issue.completedAt,
    canceledAt: issue.canceledAt,
    archivedAt: issue.archivedAt,
    deletedAt: issue.deletedAt,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    url: absoluteIssueUrl(issue.projectId, issue.key),
  };
}

/** issue-service failure → 404 or 400 with the offending field. */
export function serviceError(result: IssueServiceError): Response {
  if (result.error === 'Issue not found.' || result.error === 'Project not found.') {
    return apiError(404, result.error);
  }
  return apiError(400, result.error, result.field ? { field: result.field } : undefined);
}
