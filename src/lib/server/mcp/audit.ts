// The audit rows MCP writes (`mcp.tool_call`, category Integrations), one per
// write-tool call, with `data.outcome`:
//   - `success`: the write happened (written after the service's own batch
//     commits: the services take no extra rows and the update row needs the
//     diff; see ./tools/write.ts);
//   - `denied`: the caller may not write there (token without the write scope,
//     a role without write access, not a member, workspace blocking AI
//     connectors);
//   - `invalid`: the input didn't resolve or the service refused it;
//   - `failed`: the server threw.
// Rows never hold issue content or secrets: tool, client, outcome, a reason
// code and the target issue's key/id. A row needs a project to sit on, so an
// attempt at a project or issue that doesn't exist leaves none. Writing a row
// never throws: a failed insert is logged and the tool's answer is unchanged.

import { and, eq, or } from 'drizzle-orm';
import type { CallToolResult } from '@modelcontextprotocol/server';

import { db } from '@/lib/db';
import { recordProjectEvent } from '@/lib/audit';
import { resolveIssueKey } from '@/lib/tickets';
import { projectMembers, projects, workspaces } from '@/db/schema';
import type { McpCredential } from './contracts';
import { toolError } from './format';

export type RefusalReason =
  | 'insufficient_scope'
  | 'forbidden_role'
  | 'not_found'
  | 'not_member'
  | 'connectors_blocked'
  | 'invalid_input'
  | 'server_error';

export interface Refusal {
  outcome: 'denied' | 'invalid' | 'failed';
  reason: RefusalReason;
}

const REASON_TEXT: Record<RefusalReason, string> = {
  insufficient_scope: 'the connection has no write permission',
  forbidden_role: 'their role has no write access',
  not_found: 'the issue or project was not found',
  not_member: 'not a member of this team',
  connectors_blocked: 'AI connectors are blocked in this workspace',
  invalid_input: 'invalid input',
  server_error: 'server error',
};

/** What the caller tried to do, for the audit summary. */
const ATTEMPT: Record<string, string> = {
  create_issue: 'create an issue',
  update_issue: 'update',
  add_comment: 'comment on',
};

const clientLabel = (credential: McpCredential) =>
  credential.clientName ?? (credential.via === 'api_key' ? 'an API key' : 'an AI assistant');

const clientData = (credential: McpCredential) => ({
  via: credential.via,
  clientId: credential.clientId,
  clientName: credential.clientName,
});

/** A successful write. */
export async function auditWrite(
  credential: McpCredential,
  tool: string,
  issue: { id: string; key: string; projectId: string },
  verb: string,
) {
  try {
    await recordProjectEvent(issue.projectId, {
      actorId: credential.userId,
      type: 'mcp.tool_call',
      summary: `${verb} ${issue.key} through ${clientLabel(credential)} (MCP)`,
      data: { tool, ...clientData(credential), outcome: 'success', issueId: issue.id, key: issue.key },
    });
  } catch (err) {
    console.error(`[mcp] audit failed after a successful ${tool} on ${issue.key}`, err);
  }
}

// Tool errors that carry why the write was refused, for registerMcpTool to audit.
const refusals = new WeakMap<CallToolResult, Refusal>();

/** A tool error whose refusal is audited (write tools). */
export function refused(text: string, refusal: Refusal): CallToolResult {
  const result = toolError(text);
  refusals.set(result, refusal);
  return result;
}

/** The refusal behind a write tool's error; an untagged error is invalid input. */
export const refusalOf = (result: CallToolResult): Refusal =>
  refusals.get(result) ?? { outcome: 'invalid', reason: 'invalid_input' };

/** The project (and issue) a write named, looked up without any access rule. */
async function target(args: Record<string, unknown>): Promise<{ projectId: string; issue: { id: string; key: string } | null } | null> {
  if (typeof args.key === 'string') {
    const ref = await resolveIssueKey(args.key);
    return ref ? { projectId: ref.projectId, issue: { id: ref.id, key: args.key.trim().toUpperCase() } } : null;
  }
  if (typeof args.project === 'string' && args.project.trim()) {
    const value = args.project.trim();
    const [row] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(or(eq(projects.id, value), eq(projects.ticketKey, value.toUpperCase())))
      .limit(1);
    return row ? { projectId: row.id, issue: null } : null;
  }
  return null;
}

/** "Not found" as the caller saw it, split for admins: not a member, or the workspace blocks connectors. */
async function notFoundReason(userId: string, projectId: string): Promise<RefusalReason> {
  const [row] = await db
    .select({ member: projectMembers.userId, allowed: workspaces.aiConnectorsAllowed })
    .from(projects)
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
    .leftJoin(workspaces, eq(projects.workspaceId, workspaces.id))
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row?.member) return 'not_member';
  return row.allowed === false ? 'connectors_blocked' : 'not_found';
}

/** A write attempt that was refused or failed. */
export async function auditRefusal(
  credential: McpCredential,
  tool: string,
  args: Record<string, unknown>,
  refusal: Refusal,
) {
  try {
    const found = await target(args);
    if (!found) return;
    const reason = refusal.reason === 'not_found' ? await notFoundReason(credential.userId, found.projectId) : refusal.reason;
    const attempt = [ATTEMPT[tool] ?? tool, found.issue?.key].filter(Boolean).join(' ');
    await recordProjectEvent(found.projectId, {
      actorId: credential.userId,
      type: 'mcp.tool_call',
      // e.g. "tried to update WEB-12 through Claude (MCP), denied: their role has no write access"
      summary: `tried to ${attempt} through ${clientLabel(credential)} (MCP), ${refusal.outcome}: ${REASON_TEXT[reason]}`,
      data: {
        tool,
        ...clientData(credential),
        outcome: refusal.outcome,
        reason,
        ...(found.issue && { issueId: found.issue.id, key: found.issue.key }),
      },
    });
  } catch (err) {
    console.error(`[mcp] audit failed for a refused ${tool}`, err);
  }
}
