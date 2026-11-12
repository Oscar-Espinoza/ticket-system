// The MCP endpoint driven in-process (docs/mcp/PLAN.md → Tests): handshake,
// tools/list rules, every tool against seeded data, and tenant isolation
// (another user, and a workspace with AI connectors blocked, D8).
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';

vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: () => undefined,
}));

import { db } from '@/lib/db';
import {
  activities,
  apiKeys,
  cycles,
  labels,
  notifications,
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  projects,
  workspaceMembers,
  workspaces,
} from '@/db/schema';
import { generateApiKey } from '@/lib/api-auth';
import { createIssue } from '@/lib/issue-service';
import { createHash } from 'node:crypto';
import { handleMcpPost } from '@/lib/server/mcp/http';
import { localDb, makeProject, makeUser } from './fixtures';

const uid = () => crypto.randomUUID();
const ORIGIN = process.env.PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';

async function apiKeyFor(userId: string) {
  const { key, prefix, hash } = generateApiKey();
  await db.insert(apiKeys).values({ id: uid(), userId, name: 'mcp test', prefix, keyHash: hash, createdAt: new Date() });
  return key;
}

/** An opaque OAuth token with the given scopes (as the token endpoint would store it). */
async function oauthTokenFor(userId: string, scopes: string[]) {
  const clientId = `mcp-test-${uid()}`;
  const now = new Date();
  await db.insert(oauthClients).values({
    id: uid(),
    clientId,
    name: 'Test Assistant',
    redirectUris: ['http://localhost:9999/callback'],
    public: true,
    tokenEndpointAuthMethod: 'none',
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(oauthConsents).values({ id: uid(), clientId, userId, scopes, createdAt: now, updatedAt: now });
  const token = `opaque${uid().replace(/-/g, '')}`;
  await db.insert(oauthAccessTokens).values({
    id: uid(),
    token: createHash('sha256').update(token).digest('base64url'),
    clientId,
    userId,
    scopes,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 3600_000),
  });
  return token;
}

let rpcId = 0;
async function rpc(token: string | null, method: string, params?: Record<string, unknown>) {
  const response = await handleMcpPost(
    new Request(`${ORIGIN}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, ...(params && { params }) }),
    }),
  );
  return { status: response.status, headers: response.headers, body: response.status === 200 ? await response.json() : await response.text() };
}

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

async function call(token: string, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const res = await rpc(token, 'tools/call', { name, arguments: args });
  expect(res.status).toBe(200);
  expect(res.body.error).toBeUndefined();
  return res.body.result as ToolResult;
}

const text = (r: ToolResult) => r.content.map((c) => c.text).join('\n');

describe.skipIf(!localDb)('MCP tools over /mcp', () => {
  let alice: string;
  let bob: string;
  let aliceKey: string;
  let bobKey: string;
  let readOnly: string;
  let project: string;
  let projectKey: string;
  let issueKey: string;
  let blockedProject: string;
  let blockedKey: string;
  let blockedIssueKey: string;
  let workspaceId: string;
  const secretWord = `zebracorn${Date.now()}`;

  beforeAll(async () => {
    alice = await makeUser('alice');
    bob = await makeUser('bob');
    project = await makeProject(alice, 'MCPA');
    [{ key: projectKey }] = await db.select({ key: projects.ticketKey }).from(projects).where(eq(projects.id, project));
    const now = new Date();
    await db.insert(labels).values({ id: uid(), projectId: project, name: 'bug', color: '#ff0000', createdAt: now });
    await db.insert(cycles).values({
      id: uid(),
      projectId: project,
      number: 1,
      name: 'Sprint one',
      startsAt: new Date(now.getTime() - 3 * 86_400_000),
      endsAt: new Date(now.getTime() + 4 * 86_400_000),
      createdAt: now,
    });
    const created = await createIssue({ userId: alice }, project, {
      title: 'Login times out',
      description: `The ${secretWord} service never answers.`,
      assigneeId: alice,
      priority: 'high',
    });
    if (!created.ok) throw new Error(created.error);
    issueKey = created.issue.key;
    await db.insert(notifications).values({
      id: uid(),
      userId: alice,
      projectId: project,
      ticketId: created.issue.id,
      type: 'assigned',
      actorId: bob,
      data: { key: issueKey, title: 'Login times out' },
      createdAt: now,
    });

    // A workspace that blocks AI connectors, with a project Alice belongs to.
    workspaceId = uid();
    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Blocked Co',
      slug: `blocked-${workspaceId.slice(0, 8)}`,
      ownerId: alice,
      aiConnectorsAllowed: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(workspaceMembers).values({ id: uid(), workspaceId, userId: alice, role: 'owner', createdAt: now });
    blockedProject = await makeProject(alice, 'MCPB');
    await db.update(projects).set({ workspaceId }).where(eq(projects.id, blockedProject));
    [{ key: blockedKey }] = await db.select({ key: projects.ticketKey }).from(projects).where(eq(projects.id, blockedProject));
    const hidden = await createIssue({ userId: alice }, blockedProject, {
      title: 'Hidden roadmap',
      description: `Secret ${secretWord} plans.`,
      assigneeId: alice,
    });
    if (!hidden.ok) throw new Error(hidden.error);
    blockedIssueKey = hidden.issue.key;
    await db.insert(notifications).values({
      id: uid(),
      userId: alice,
      projectId: blockedProject,
      ticketId: hidden.issue.id,
      type: 'assigned',
      actorId: bob,
      data: { key: blockedIssueKey, title: 'Hidden roadmap' },
      createdAt: now,
    });

    aliceKey = await apiKeyFor(alice);
    bobKey = await apiKeyFor(bob);
    readOnly = await oauthTokenFor(alice, ['read']);
  });

  it('answers initialize and lists tools that follow the catalogue rules', async () => {
    const init = await rpc(aliceKey, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'vitest', version: '1' },
    });
    expect(init.status).toBe(200);
    expect(init.headers.get('access-control-allow-origin')).toBe('*');
    expect(init.body.result.serverInfo.name).toBe('ticket-system');
    expect(init.body.result.instructions).toContain('WEB-123');

    const list = await rpc(aliceKey, 'tools/list');
    const tools = list.body.result.tools as {
      name: string;
      title: string;
      annotations: Record<string, unknown>;
      _meta: Record<string, unknown>;
    }[];
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'add_comment',
        'create_issue',
        'get_cycle',
        'get_issue',
        'get_project_metadata',
        'get_project_overview',
        'list_inbox',
        'list_issues',
        'list_projects',
        'my_work',
        'search_issues',
        'update_issue',
      ].sort(),
    );
    for (const tool of tools) {
      expect(tool.name.length).toBeLessThanOrEqual(64);
      for (const hint of ['title', 'readOnlyHint', 'destructiveHint', 'openWorldHint']) {
        expect(tool.annotations[hint], `${tool.name}.${hint}`).toBeDefined();
      }
      expect(tool.annotations.openWorldHint).toBe(false);
      expect(tool._meta.securitySchemes).toBeDefined();
      expect(String(tool._meta['openai/toolInvocation/invoking']).length).toBeLessThanOrEqual(64);
      expect(tool._meta['ui/resourceUri']).toBeUndefined();
    }
    // D6: exactly three writes; update_issue overwrites, so hosts confirm it.
    const writes = tools.filter((t) => t.annotations.readOnlyHint === false).map((t) => t.name).sort();
    expect(writes).toEqual(['add_comment', 'create_issue', 'update_issue']);
    const destructive = tools.filter((t) => t.annotations.destructiveHint === true).map((t) => t.name);
    expect(destructive).toEqual(['update_issue']);
  });

  it('serves every read tool for a member', async () => {
    const projectsResult = await call(aliceKey, 'list_projects');
    const listed = (projectsResult.structuredContent!.projects as { key: string; openIssues: number }[]).map((p) => p.key);
    expect(listed).toContain(projectKey);

    const search = await call(aliceKey, 'search_issues', { query: secretWord });
    expect((search.structuredContent!.issues as { key: string }[]).map((i) => i.key)).toEqual([issueKey]);

    const filtered = await call(aliceKey, 'list_issues', { project: projectKey, assignee: 'me', group_by: 'state' });
    expect(text(filtered)).toContain(issueKey);

    const mine = await call(aliceKey, 'my_work');
    expect((mine.structuredContent!.issues as { key: string }[]).map((i) => i.key)).toEqual([issueKey]);

    const issue = await call(aliceKey, 'get_issue', { key: issueKey.toLowerCase() });
    expect(issue.isError).toBeUndefined();
    expect(issue.structuredContent!.view).toBe('issue-detail');
    expect(text(issue)).toContain(secretWord);

    const overview = await call(aliceKey, 'get_project_overview', { project: projectKey });
    expect(overview.structuredContent!.view).toBe('project-overview');
    expect((overview.structuredContent!.cycle as { number: number }).number).toBe(1);

    const cycle = await call(aliceKey, 'get_cycle', { project: project, cycle: 'current' });
    expect(cycle.isError).toBeUndefined();
    expect(text(cycle)).toContain('Sprint one');

    const meta = await call(aliceKey, 'get_project_metadata', { project: projectKey });
    expect((meta.structuredContent!.labels as { name: string }[]).map((l) => l.name)).toEqual(['bug']);
    expect(meta.structuredContent!.members).toEqual([{ id: alice, name: 'alice', role: 'owner' }]);

    const inbox = await call(aliceKey, 'list_inbox', { unread_only: true });
    expect(text(inbox)).toContain(issueKey);
  });

  it('runs the three writes and audits each with its client', async () => {
    const created = await call(aliceKey, 'create_issue', {
      project: projectKey,
      title: 'Write from MCP',
      state: 'In Progress',
      assignee: 'me',
      labels: ['BUG'],
      cycle: 'current',
    });
    expect(created.isError).toBeUndefined();
    const detail = created.structuredContent!.issue as { key: string; state: { name: string }; labels: { name: string }[] };
    expect(detail.state.name).toBe('In Progress');
    expect(detail.labels.map((l) => l.name)).toEqual(['bug']);

    const badState = await call(aliceKey, 'update_issue', { key: detail.key, state: 'Shipped' });
    expect(badState.isError).toBe(true);
    expect(text(badState)).toContain('"Done"');

    const updated = await call(aliceKey, 'update_issue', { key: detail.key, state: 'done', priority: 'urgent', assignee: null });
    expect(updated.isError).toBeUndefined();
    expect(updated.structuredContent!.changes).toEqual(
      expect.arrayContaining(['state: In Progress → Done', 'priority: none → urgent', 'assignee: alice → none']),
    );

    const comment = await call(aliceKey, 'add_comment', { key: detail.key, body: 'Done via **MCP**.' });
    expect(comment.isError).toBeUndefined();
    expect(text(comment)).toContain('Done via **MCP**.');

    const audited = await db
      .select({ data: activities.data })
      .from(activities)
      .where(and(eq(activities.projectId, project), eq(activities.type, 'mcp.tool_call')));
    const tools = audited.map((a) => (a.data as { tool: string; key: string }).tool).sort();
    expect(tools).toEqual(['add_comment', 'create_issue', 'update_issue']);
    expect(audited.every((a) => (a.data as { key: string }).key === detail.key)).toBe(true);
  });

  it('refuses a write with a read-only token as insufficient_scope', async () => {
    const result = await call(readOnly, 'create_issue', { project: projectKey, title: 'Nope' });
    expect(result.isError).toBe(true);
    const challenge = (result._meta!['mcp/www_authenticate'] as string[])[0];
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain('scope="write"');
    expect((await call(readOnly, 'get_issue', { key: issueKey })).isError).toBeUndefined();
  });

  it("never shows another user's project, by key, id or search", async () => {
    const notFound = async (name: string, args: Record<string, unknown>) => {
      const result = await call(bobKey, name, args);
      expect(result.isError, `${name} ${JSON.stringify(args)}`).toBe(true);
      expect(text(result)).toMatch(/not found/);
      expect(text(result)).not.toContain(secretWord);
    };
    await notFound('get_issue', { key: issueKey });
    for (const ref of [projectKey, project]) {
      await notFound('list_issues', { project: ref });
      await notFound('get_project_overview', { project: ref });
      await notFound('get_project_metadata', { project: ref });
      await notFound('get_cycle', { project: ref });
      await notFound('search_issues', { query: secretWord, project: ref });
      await notFound('create_issue', { project: ref, title: 'Intrusion' });
    }
    await notFound('update_issue', { key: issueKey, title: 'Hacked' });
    await notFound('add_comment', { key: issueKey, body: 'Hi' });

    const search = await call(bobKey, 'search_issues', { query: secretWord });
    expect(search.structuredContent!.issues).toEqual([]);
    expect(text(search)).not.toContain(issueKey);
    const projectsResult = await call(bobKey, 'list_projects');
    expect(projectsResult.structuredContent!.projects).toEqual([]);
  });

  it('treats a workspace with connectors blocked as nonexistent until it allows them', async () => {
    const hiddenIssue = await call(aliceKey, 'get_issue', { key: blockedIssueKey });
    expect(hiddenIssue.isError).toBe(true);
    expect((await call(aliceKey, 'list_issues', { project: blockedKey })).isError).toBe(true);
    expect((await call(aliceKey, 'create_issue', { project: blockedProject, title: 'x' })).isError).toBe(true);
    const search = await call(aliceKey, 'search_issues', { query: secretWord });
    expect((search.structuredContent!.issues as { key: string }[]).map((i) => i.key)).toEqual([issueKey]);
    const listed = (await call(aliceKey, 'list_projects')).structuredContent!.projects as { key: string }[];
    expect(listed.map((p) => p.key)).not.toContain(blockedKey);
    const mine = (await call(aliceKey, 'my_work')).structuredContent!.issues as { key: string }[];
    expect(mine.map((i) => i.key)).not.toContain(blockedIssueKey);
    expect(text(await call(aliceKey, 'list_inbox'))).not.toContain(blockedIssueKey);

    await db.update(workspaces).set({ aiConnectorsAllowed: true }).where(eq(workspaces.id, workspaceId));
    expect((await call(aliceKey, 'get_issue', { key: blockedIssueKey })).isError).toBeUndefined();
    await db.update(workspaces).set({ aiConnectorsAllowed: false }).where(eq(workspaces.id, workspaceId));
  });
});
