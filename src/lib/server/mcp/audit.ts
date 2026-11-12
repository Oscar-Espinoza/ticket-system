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
// code and the target issue's key/id. A refusal is written only into the log
// of a project the caller is a member of: an attempt by an outsider, or at a
// project or issue that doesn't exist, leaves no row in any team's log (a
// server log line only), so nobody can write their name or a self-chosen
// client name into another team's log, and a mistyped key doesn't show a
// stranger's identity to an unrelated team. Writing a row
// never throws: a failed insert is logged and the tool's answer is unchanged.

import { and, eq, or, type SQL } from 'drizzle-orm';
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

/**
 * The project (and issue) a write named, only if the caller is a member of
 * that project (whatever their role, and even when the workspace blocks
 * connectors). Membership is part of the lookup, so a project or issue that
 * exists costs the same queries as one that doesn't, and an outsider's attempt
 * finds nothing to write on.
 */
async function target(
  userId: string,
  args: Record<string, unknown>,
): Promise<{ projectId: string; connectorsAllowed: boolean; issue: { id: string; key: string } | null } | null> {
  // The caller's membership row joined in: no row for a non-member.
  const memberProject = (where: SQL | undefined) =>
    db
      .select({ id: projects.id, allowed: workspaces.aiConnectorsAllowed })
      .from(projects)
      .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
      .leftJoin(workspaces, eq(projects.workspaceId, workspaces.id))
      .where(where)
      .limit(1);
  if (typeof args.key === 'string') {
    const ref = await resolveIssueKey(args.key, { memberId: userId });
    if (!ref) return null;
    const [row] = await memberProject(eq(projects.id, ref.projectId));
    if (!row) return null;
    return { projectId: row.id, connectorsAllowed: row.allowed !== false, issue: { id: ref.id, key: args.key.trim().toUpperCase() } };
  }
  if (typeof args.project === 'string' && args.project.trim()) {
    const value = args.project.trim();
    const [row] = await memberProject(or(eq(projects.id, value), eq(projects.ticketKey, value.toUpperCase())));
    return row ? { projectId: row.id, connectorsAllowed: row.allowed !== false, issue: null } : null;
  }
  return null;
}

/** A write attempt that was refused or failed. */
export async function auditRefusal(
  credential: McpCredential,
  tool: string,
  args: Record<string, unknown>,
  refusal: Refusal,
) {
  try {
    const found = await target(credential.userId, args);
    if (!found) {
      // Not a member (or nothing by that name): no team's log gets the row.
      console.info(`[mcp] refused ${tool} for user ${credential.userId} via ${credential.via}: ${refusal.outcome} ${refusal.reason}, no project of theirs named`);
      return;
    }
    // "Not found" as a member saw it: hidden because the workspace blocks connectors.
    const reason = refusal.reason === 'not_found' && !found.connectorsAllowed ? 'connectors_blocked' : refusal.reason;
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
