// Per-request GraphQL context: the authenticated credential plus batched,
// cached loaders. Loaders fetch raw rows WITHOUT authorization; resolvers gate
// everything project-scoped through `roleIn` / `visibleIssue` (see resolvers.ts).

import { GraphQLError } from 'graphql';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  comments,
  cycles,
  epics,
  issueRelations,
  labels,
  projectMembers,
  projects,
  tickets,
  users,
  workflowStates,
} from '@/db/schema';
import type { ApiCredential, ApiScope } from '@/lib/api-auth';
import type { IssueRow } from '@/lib/issue-model';
import type { ProjectRole } from '@/lib/roles';
import { roleAllows, type AccessLevel } from '@/lib/roles';
import { queryIssues } from '@/lib/tickets';
import { createLoader, groupBy } from './loader';

type ProjectRow = typeof projects.$inferSelect;
type CommentRow = typeof comments.$inferSelect;
type RelationRow = typeof issueRelations.$inferSelect;

export interface GraphQLContext {
  credential: ApiCredential | null;
  loaders: ReturnType<typeof createLoaders>;
}

export function createLoaders(viewerId: string) {
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

  return {
    /** The viewer's role in a project (null = not a member). */
    role: createLoader<string, ProjectRole | null>(async (ids) => {
      const rows = await db
        .select({ projectId: projectMembers.projectId, role: projectMembers.role })
        .from(projectMembers)
        .where(and(eq(projectMembers.userId, viewerId), inArray(projectMembers.projectId, ids)));
      return new Map(rows.map((r) => [r.projectId, r.role]));
    }, null),

    project: createLoader<string, ProjectRow | null>(
      async (ids) => byId(await db.select().from(projects).where(inArray(projects.id, ids))),
      null,
    ),

    user: createLoader<string, { id: string; name: string; image: string | null } | null>(
      async (ids) =>
        byId(
          await db
            .select({ id: users.id, name: users.name, image: users.image })
            .from(users)
            .where(inArray(users.id, ids)),
        ),
      null,
    ),

    issue: createLoader<string, IssueRow | null>(
      async (ids) => byId(await queryIssues(inArray(tickets.id, ids))),
      null,
    ),

    /** Non-trashed sub-issues, by parent id. */
    children: createLoader<string, IssueRow[]>(async (ids) => {
      const rows = await queryIssues(
        and(inArray(tickets.parentId, ids), isNull(tickets.deletedAt)),
        { orderBy: [asc(tickets.sortOrder), asc(tickets.ticketNumber)] },
      );
      return groupBy(rows, (r) => r.parentId as string);
    }, []),

    comments: createLoader<string, CommentRow[]>(async (ids) => {
      const rows = await db
        .select()
        .from(comments)
        .where(inArray(comments.ticketId, ids))
        .orderBy(asc(comments.createdAt));
      return groupBy(rows, (r) => r.ticketId);
    }, []),

    /** Relation rows touching an issue, from either side. */
    relations: createLoader<string, RelationRow[]>(async (ids) => {
      const [outgoing, incoming] = await db.batch([
        db.select().from(issueRelations).where(inArray(issueRelations.ticketId, ids)),
        db.select().from(issueRelations).where(inArray(issueRelations.relatedTicketId, ids)),
      ]);
      const map = new Map<string, RelationRow[]>();
      const push = (key: string, row: RelationRow) => {
        const list = map.get(key);
        if (list) list.push(row);
        else map.set(key, [row]);
      };
      for (const row of outgoing) push(row.ticketId, row);
      for (const row of incoming) push(row.relatedTicketId, row);
      return map;
    }, []),

    states: createLoader(async (projectIds: string[]) => {
      const rows = await db
        .select()
        .from(workflowStates)
        .where(inArray(workflowStates.projectId, projectIds))
        .orderBy(asc(workflowStates.position));
      return groupBy(rows, (r) => r.projectId);
    }, [] as (typeof workflowStates.$inferSelect)[]),

    labels: createLoader(async (projectIds: string[]) => {
      const rows = await db
        .select()
        .from(labels)
        .where(inArray(labels.projectId, projectIds))
        .orderBy(asc(labels.name));
      return groupBy(rows, (r) => r.projectId);
    }, [] as (typeof labels.$inferSelect)[]),

    label: createLoader(
      async (ids: string[]) => byId(await db.select().from(labels).where(inArray(labels.id, ids))),
      null as (typeof labels.$inferSelect) | null,
    ),

    members: createLoader(async (projectIds: string[]) => {
      const rows = await db
        .select({
          projectId: projectMembers.projectId,
          role: projectMembers.role,
          joinedAt: projectMembers.createdAt,
          id: users.id,
          name: users.name,
          image: users.image,
        })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(inArray(projectMembers.projectId, projectIds))
        .orderBy(asc(users.name));
      return groupBy(rows, (r) => r.projectId);
    }, [] as { projectId: string; role: ProjectRole; joinedAt: Date; id: string; name: string; image: string | null }[]),

    cycles: createLoader(async (projectIds: string[]) => {
      const rows = await db
        .select()
        .from(cycles)
        .where(inArray(cycles.projectId, projectIds))
        .orderBy(asc(cycles.number));
      return groupBy(rows, (r) => r.projectId);
    }, [] as (typeof cycles.$inferSelect)[]),

    cycle: createLoader(
      async (ids: string[]) => byId(await db.select().from(cycles).where(inArray(cycles.id, ids))),
      null as (typeof cycles.$inferSelect) | null,
    ),

    epics: createLoader(async (projectIds: string[]) => {
      const rows = await db
        .select()
        .from(epics)
        .where(inArray(epics.projectId, projectIds))
        .orderBy(asc(epics.sortOrder), asc(epics.name));
      return groupBy(rows, (r) => r.projectId);
    }, [] as (typeof epics.$inferSelect)[]),

    epic: createLoader(
      async (ids: string[]) => byId(await db.select().from(epics).where(inArray(epics.id, ids))),
      null as (typeof epics.$inferSelect) | null,
    ),
  };
}

// ---------------------------------------------------------------------------
// Errors + gates
// ---------------------------------------------------------------------------

export function gqlError(
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_USER_INPUT',
  message: string,
  extra?: Record<string, unknown>,
): GraphQLError {
  return new GraphQLError(message, { extensions: { code, ...extra } });
}

/** The credential, or UNAUTHENTICATED. */
export function viewer(ctx: GraphQLContext): ApiCredential {
  if (!ctx.credential) {
    throw gqlError('UNAUTHENTICATED', 'Send Authorization: Bearer <API key or OAuth access token>.');
  }
  return ctx.credential;
}

export function requireScope(ctx: GraphQLContext, scope: ApiScope) {
  if (!viewer(ctx).scopes.has(scope)) {
    throw gqlError('FORBIDDEN', `This access token lacks the "${scope}" scope.`);
  }
}

/** The viewer's role when it allows `level`; null for non-members. */
export async function roleIn(
  ctx: GraphQLContext,
  projectId: string,
  level: AccessLevel = 'read',
): Promise<ProjectRole | null> {
  viewer(ctx);
  const role = await ctx.loaders.role.load(projectId);
  if (!role) return null;
  if (!roleAllows(role, level)) {
    throw gqlError('FORBIDDEN', `This requires ${level} access to the project.`);
  }
  return role;
}

/** Like roleIn, but a non-member is NOT_FOUND (same as a missing project). */
export async function requireProjectRole(
  ctx: GraphQLContext,
  projectId: string,
  level: AccessLevel,
): Promise<ProjectRole> {
  const role = await roleIn(ctx, projectId, level);
  if (!role) throw gqlError('NOT_FOUND', 'Project not found.');
  return role;
}

/** An issue the viewer can read, else null (hides other projects' issues). */
export async function visibleIssue(ctx: GraphQLContext, id: string | null): Promise<IssueRow | null> {
  if (!id) return null;
  const issue = await ctx.loaders.issue.load(id);
  if (!issue) return null;
  return (await ctx.loaders.role.load(issue.projectId)) ? issue : null;
}
