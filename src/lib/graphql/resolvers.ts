// GraphQL resolvers. Authorization model = REST v1: the credential's user,
// their role per project (read / comment / write), non-members see "not found".
// Every Query root needs the `read` scope and every Mutation `write` (OAuth
// tokens; API keys have both) — enforced by `withScope` below. Writes go
// through issue-service / createCommentAs so activity, notifications, Slack
// and webhooks see them exactly like app changes.

import { GraphQLScalarType, Kind } from 'graphql';
import { asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, projects, users } from '@/db/schema';
import { createCommentAs } from '@/lib/comments';
import type { CreateIssueInput, IssuePatch, IssueRow } from '@/lib/issue-model';
import {
  archive,
  createIssue,
  softDelete,
  updateIssueFields,
  type IssueServiceError,
} from '@/lib/issue-service';
import { absoluteIssueUrl, appUrl } from '@/lib/integrations/app-url';
import type { AccessLevel } from '@/lib/roles';
import { searchIssues } from '@/lib/search';
import {
  gqlError,
  requireProjectRole,
  requireScope,
  roleIn,
  viewer,
  visibleIssue,
  type GraphQLContext,
} from './context';
import { resolveIssueKey } from './issue-key';
import { ISSUE_PAGE_MAX, listProjectIssues, type IssueListFilter } from './issue-list';

type Ctx = GraphQLContext;
type ProjectRow = typeof projects.$inferSelect;
type Args = Record<string, unknown>;

const SEARCH_MAX = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  serialize: (value) => (value instanceof Date ? value.toISOString() : value),
  parseValue: (value) => {
    const date = typeof value === 'string' ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) throw gqlError('BAD_USER_INPUT', 'Invalid DateTime.');
    return date.toISOString();
  },
  parseLiteral: (ast) => {
    const date = ast.kind === Kind.STRING ? new Date(ast.value) : null;
    if (!date || Number.isNaN(date.getTime())) throw gqlError('BAD_USER_INPUT', 'Invalid DateTime.');
    return date.toISOString();
  },
});

function serviceError(result: IssueServiceError): never {
  if (result.error === 'Issue not found.' || result.error === 'Project not found.') {
    throw gqlError('NOT_FOUND', result.error);
  }
  throw gqlError('BAD_USER_INPUT', result.error, result.field ? { field: result.field } : undefined);
}

function pageSize(first: unknown, max: number): number {
  const n = first ?? 50;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > max) {
    throw gqlError('BAD_USER_INPUT', `first must be between 1 and ${max}.`, { field: 'first' });
  }
  return n;
}

/** Issue by `id` or `key` if the viewer is a member (FORBIDDEN when below `level`). */
async function lookupIssue(ctx: Ctx, args: Args, level: AccessLevel): Promise<IssueRow | null> {
  const id = typeof args.id === 'string' ? args.id : null;
  const key = typeof args.key === 'string' ? args.key : null;
  if (!id === !key) throw gqlError('BAD_USER_INPUT', 'Pass exactly one of id or key.');

  const ref = id ? { id } : await resolveIssueKey(key as string);
  const issue = ref ? await ctx.loaders.issue.load(ref.id) : null;
  return issue && (await roleIn(ctx, issue.projectId, level)) ? issue : null;
}

/** lookupIssue, NOT_FOUND for missing issues and non-members alike. */
async function findIssue(ctx: Ctx, args: Args, level: AccessLevel): Promise<IssueRow> {
  const issue = await lookupIssue(ctx, args, level);
  if (!issue) throw gqlError('NOT_FOUND', 'Issue not found.');
  return issue;
}

async function issueConnection(ctx: Ctx, projectId: string, args: Args) {
  const filter = (args.filter ?? {}) as IssueListFilter;
  const result = await listProjectIssues(viewer(ctx).userId, projectId, filter, {
    limit: pageSize(args.first, ISSUE_PAGE_MAX),
    cursor: typeof args.after === 'string' ? args.after : null,
  });
  if (!result.ok) throw gqlError('BAD_USER_INPUT', result.error, { field: result.field });
  for (const issue of result.issues) ctx.loaders.issue.prime(issue.id, issue);
  return {
    nodes: result.issues,
    pageInfo: { hasNextPage: result.nextCursor !== null, endCursor: result.nextCursor },
  };
}

async function viewerProjects(ctx: Ctx) {
  const rows = await db
    .select({ project: projects })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, viewer(ctx).userId))
    .orderBy(asc(projects.name));
  return rows.map(({ project }) => {
    ctx.loaders.project.prime(project.id, project);
    return project;
  });
}

/** Strip GraphQL's null-prototype + unknown keys; absent stays absent. */
function pick<T>(input: Args, keys: readonly string[]): T {
  const out: Args = {};
  for (const key of keys) if (key in input) out[key] = input[key];
  return out as T;
}

const CREATE_FIELDS = [
  'title', 'description', 'stateId', 'priority', 'estimate', 'startDate', 'dueDate',
  'assigneeId', 'labelIds', 'parentId', 'cycleId', 'epicId', 'milestoneId',
] as const;
const UPDATE_FIELDS = [...CREATE_FIELDS, 'addLabelIds', 'removeLabelIds', 'sortOrder'] as const;

// ---------------------------------------------------------------------------
// Resolver map
// ---------------------------------------------------------------------------

type Resolver = (parent: never, args: Args, ctx: Ctx) => unknown;

const Query: Record<string, Resolver> = {
  viewer: async (_p, _a, ctx) => {
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email, image: users.image })
      .from(users)
      .where(eq(users.id, viewer(ctx).userId))
      .limit(1);
    if (!user) throw gqlError('UNAUTHENTICATED', 'User not found.');
    return user;
  },

  projects: (_p, _a, ctx) => viewerProjects(ctx),

  project: async (_p, args, ctx) => {
    const id = typeof args.id === 'string' ? args.id : null;
    const key = typeof args.key === 'string' ? args.key.trim().toUpperCase() : null;
    if (!id === !key) throw gqlError('BAD_USER_INPUT', 'Pass exactly one of id or key.');
    let project: ProjectRow | null;
    if (id) project = await ctx.loaders.project.load(id);
    else {
      [project = null] = await db.select().from(projects).where(eq(projects.ticketKey, key!)).limit(1);
    }
    return project && (await roleIn(ctx, project.id)) ? project : null;
  },

  issue: (_p, args, ctx) => lookupIssue(ctx, args, 'read'),

  issues: async (_p, args, ctx) => {
    const projectId = String(args.projectId);
    await requireProjectRole(ctx, projectId, 'read');
    return issueConnection(ctx, projectId, args);
  },

  search: async (_p, args, ctx) => {
    const first = pageSize(args.first ?? 20, SEARCH_MAX);
    const projectId = typeof args.projectId === 'string' ? args.projectId : null;
    if (projectId) await requireProjectRole(ctx, projectId, 'read');
    // searchIssues scopes to the viewer's projects itself.
    const results = await searchIssues(viewer(ctx).userId, String(args.query ?? ''), { projectId });
    return results.slice(0, first).map(({ issue }) => {
      ctx.loaders.issue.prime(issue.id, issue);
      return issue;
    });
  },
};

const Mutation: Record<string, Resolver> = {
  createIssue: async (_p, args, ctx) => {
    const input = (args.input ?? {}) as Args;
    const projectId = String(input.projectId);
    await requireProjectRole(ctx, projectId, 'write');
    const result = await createIssue(
      { userId: viewer(ctx).userId },
      projectId,
      pick<CreateIssueInput>(input, CREATE_FIELDS),
    );
    if (!result.ok) serviceError(result);
    return result.issue;
  },

  updateIssue: async (_p, args, ctx) => {
    const issue = await findIssue(ctx, args, 'write');
    const result = await updateIssueFields(
      { userId: viewer(ctx).userId },
      issue.projectId,
      issue.id,
      pick<IssuePatch>((args.input ?? {}) as Args, UPDATE_FIELDS),
    );
    if (!result.ok) serviceError(result);
    return result.issue;
  },

  archiveIssue: async (_p, args, ctx) => {
    const issue = await findIssue(ctx, args, 'write');
    const result = await archive({ userId: viewer(ctx).userId }, issue.projectId, issue.id);
    if (!result.ok) serviceError(result);
    return result.issue;
  },

  deleteIssue: async (_p, args, ctx) => {
    const issue = await findIssue(ctx, args, 'write');
    const result = await softDelete({ userId: viewer(ctx).userId }, issue.projectId, issue.id);
    if (!result.ok) serviceError(result);
    return result.issue;
  },

  createComment: async (_p, args, ctx) => {
    const input = (args.input ?? {}) as Args;
    const issue = await findIssue(ctx, { id: input.issueId, key: input.issueKey }, 'comment');
    if (issue.deletedAt) throw gqlError('NOT_FOUND', 'Issue not found.');
    const result = await createCommentAs({ userId: viewer(ctx).userId }, issue.projectId, {
      ticketId: issue.id,
      body: input.body,
      parentId: input.parentId,
    });
    if (!result.ok) {
      throw gqlError(result.error === 'Issue not found.' ? 'NOT_FOUND' : 'BAD_USER_INPUT', result.error);
    }
    const { comment } = result;
    return {
      id: comment.id,
      ticketId: issue.id,
      parentId: comment.parentId,
      body: comment.body,
      authorId: viewer(ctx).userId,
      createdAt: comment.createdAt,
      editedAt: comment.editedAt,
    };
  },
};

/** Scope gate on every root field (OAuth tokens: read for queries, write for mutations). */
function withScope(fields: Record<string, Resolver>, scope: 'read' | 'write') {
  return Object.fromEntries(
    Object.entries(fields).map(([name, resolve]) => [
      name,
      (parent: never, args: Args, ctx: Ctx) => {
        requireScope(ctx, scope);
        return resolve(parent, args, ctx);
      },
    ]),
  );
}

export const resolvers = {
  DateTime,
  Query: withScope(Query, 'read'),
  Mutation: withScope(Mutation, 'write'),

  Viewer: {
    projects: (_v: unknown, _a: Args, ctx: Ctx) => viewerProjects(ctx),
  },

  Project: {
    key: (p: ProjectRow) => p.ticketKey,
    role: (p: ProjectRow, _a: Args, ctx: Ctx) => ctx.loaders.role.load(p.id),
    states: (p: ProjectRow, _a: Args, ctx: Ctx) => ctx.loaders.states.load(p.id),
    labels: (p: ProjectRow, _a: Args, ctx: Ctx) => ctx.loaders.labels.load(p.id),
    members: async (p: ProjectRow, _a: Args, ctx: Ctx) =>
      (await ctx.loaders.members.load(p.id)).map((m) => ({
        user: { id: m.id, name: m.name, image: m.image },
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    cycles: (p: ProjectRow, _a: Args, ctx: Ctx) => ctx.loaders.cycles.load(p.id),
    epics: async (p: ProjectRow, args: Args, ctx: Ctx) => {
      const list = await ctx.loaders.epics.load(p.id);
      return args.includeArchived ? list : list.filter((e) => !e.archivedAt);
    },
    issues: (p: ProjectRow, args: Args, ctx: Ctx) => issueConnection(ctx, p.id, args),
    url: (p: ProjectRow) => `${appUrl()}/dashboard/projects/${p.id}`,
  },

  Label: {
    // Issue labels carry id/name/color only; fetch the description lazily.
    description: async (l: { id: string; description?: string | null }, _a: Args, ctx: Ctx) =>
      l.description !== undefined ? l.description : ((await ctx.loaders.label.load(l.id))?.description ?? null),
  },

  Epic: {
    lead: (e: { leadId: string | null }, _a: Args, ctx: Ctx) =>
      e.leadId ? ctx.loaders.user.load(e.leadId) : null,
  },

  Issue: {
    project: async (i: IssueRow, _a: Args, ctx: Ctx) => ctx.loaders.project.load(i.projectId),
    parent: (i: IssueRow, _a: Args, ctx: Ctx) => visibleIssue(ctx, i.parentId),
    children: async (i: IssueRow, _a: Args, ctx: Ctx) => {
      const children = await ctx.loaders.children.load(i.id);
      const roles = await ctx.loaders.role.loadMany(children.map((c) => c.projectId));
      return children.filter((_, index) => roles[index]);
    },
    cycle: (i: IssueRow, _a: Args, ctx: Ctx) => (i.cycleId ? ctx.loaders.cycle.load(i.cycleId) : null),
    epic: async (i: IssueRow, _a: Args, ctx: Ctx) => {
      if (!i.epicId) return null;
      const epic = await ctx.loaders.epic.load(i.epicId);
      // Cross-project epics: only when the viewer can see the epic's project.
      return epic && (await ctx.loaders.role.load(epic.projectId)) ? epic : null;
    },
    comments: (i: IssueRow, _a: Args, ctx: Ctx) => ctx.loaders.comments.load(i.id),
    relations: async (i: IssueRow, _a: Args, ctx: Ctx) => {
      const rows = await ctx.loaders.relations.load(i.id);
      const resolved = await Promise.all(
        rows.map(async (row) => {
          const outgoing = row.ticketId === i.id;
          const other = await visibleIssue(ctx, outgoing ? row.relatedTicketId : row.ticketId);
          if (!other) return null;
          const type =
            row.type === 'related'
              ? 'related'
              : row.type === 'blocks'
                ? outgoing ? 'blocks' : 'blocked_by'
                : outgoing ? 'duplicate_of' : 'duplicated_by';
          return { id: row.id, type, issue: other };
        }),
      );
      return resolved.filter((r) => r !== null);
    },
    url: (i: IssueRow) => absoluteIssueUrl(i.projectId, i.key),
  },

  Comment: {
    issueId: (c: { ticketId: string }) => c.ticketId,
    author: (c: { authorId: string | null }, _a: Args, ctx: Ctx) =>
      c.authorId ? ctx.loaders.user.load(c.authorId) : null,
  },
};
