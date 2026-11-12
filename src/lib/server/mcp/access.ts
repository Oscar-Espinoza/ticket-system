// The one access rule for MCP tools (docs/mcp/PLAN.md D8 + security checklist):
// a project is visible to an MCP caller when the user is a member of it AND it
// is outside any workspace or its workspace allows AI assistant connectors.
// Anything else is indistinguishable from a project that doesn't exist, the
// same as REST v1 (src/lib/api-access.ts decides read/write/comment by role).
// Every tool goes through this file; tools never trust ids the model passes.

import { and, asc, eq, isNull, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { checkProjectAccess } from '@/lib/api-access';
import type { AccessLevel, ProjectRole } from '@/lib/roles';
import { getTicketById, resolveIssueKey } from '@/lib/tickets';
import type { IssueRow } from '@/lib/issue-model';
import { projectMembers, projects, workspaces } from '@/db/schema';

export interface McpProject {
  id: string;
  key: string;
  name: string;
  description: string | null;
  role: ProjectRole;
  workspace: { id: string; name: string } | null;
}

/** Member AND (no workspace OR connectors allowed). */
function visibleTo(userId: string) {
  return and(
    eq(projectMembers.userId, userId),
    or(isNull(projects.workspaceId), eq(workspaces.aiConnectorsAllowed, true)),
  );
}

function projectRows(userId: string, extra?: ReturnType<typeof eq>) {
  return db
    .select({
      id: projects.id,
      key: projects.ticketKey,
      name: projects.name,
      description: projects.description,
      role: projectMembers.role,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .leftJoin(workspaces, eq(projects.workspaceId, workspaces.id))
    .where(extra ? and(visibleTo(userId), extra) : visibleTo(userId))
    .orderBy(asc(projects.name));
}

function toProject(row: Awaited<ReturnType<typeof projectRows>>[number]): McpProject {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    role: row.role,
    workspace: row.workspaceId ? { id: row.workspaceId, name: row.workspaceName ?? '' } : null,
  };
}

/** Every project the caller may reach through MCP, by name. */
export async function mcpProjects(userId: string): Promise<McpProject[]> {
  return (await projectRows(userId)).map(toProject);
}

export type ProjectAccess =
  | { ok: true; project: McpProject }
  | { ok: false; error: string; notFound: boolean };

const PROJECT_NOT_FOUND = (ref: string) => ({
  ok: false as const,
  notFound: true,
  error: `Project "${ref}" not found. Use list_projects to see the projects you can reach.`,
});

/**
 * A project by key (`WEB`, case-insensitive) or id, if the caller may reach it
 * at `level`. Non-members, blocked workspaces and missing projects all answer
 * the same "not found".
 */
export async function mcpProject(userId: string, ref: string, level: AccessLevel): Promise<ProjectAccess> {
  const value = typeof ref === 'string' ? ref.trim() : '';
  if (!value || value.length > 100) return PROJECT_NOT_FOUND(String(ref ?? ''));
  const [row] = await projectRows(
    userId,
    or(eq(projects.id, value), eq(projects.ticketKey, value.toUpperCase())) as ReturnType<typeof eq>,
  ).limit(1);
  if (!row) return PROJECT_NOT_FOUND(value);
  const access = checkProjectAccess(row.role, level);
  if (access.kind === 'forbidden') return { ok: false, notFound: false, error: access.message };
  if (access.kind !== 'ok') return PROJECT_NOT_FOUND(value);
  return { ok: true, project: toProject(row) };
}

export type IssueAccess =
  | { ok: true; issue: IssueRow; project: McpProject }
  | { ok: false; error: string; notFound: boolean };

/** An issue by key (`WEB-12`, following moved-issue aliases) the caller may reach at `level`. */
export async function mcpIssue(userId: string, key: string, level: AccessLevel): Promise<IssueAccess> {
  const notFound = {
    ok: false as const,
    notFound: true,
    error: `Issue "${String(key ?? '')}" not found. Issue keys look like WEB-123.`,
  };
  if (typeof key !== 'string') return notFound;
  const ref = await resolveIssueKey(key);
  if (!ref) return notFound;
  const access = await mcpProject(userId, ref.projectId, level);
  if (!access.ok) return access.notFound ? notFound : access;
  const issue = await getTicketById(ref.projectId, ref.id);
  return issue ? { ok: true, issue, project: access.project } : notFound;
}
