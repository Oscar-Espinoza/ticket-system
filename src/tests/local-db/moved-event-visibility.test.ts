import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

// No after-response fan-out: the sweep and the readers are called directly.
vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: () => undefined,
}));
vi.mock('@/lib/events', async (orig) => ({
  ...(await orig<typeof import('@/lib/events')>()),
  publishIssueEvents: () => undefined,
}));

import { db } from '@/lib/db';
import { activities, projectMembers, projects, webhookDeliveries, webhooks } from '@/db/schema';
import * as issues from '@/lib/issue-service';
import { loadIssueTimeline } from '@/lib/comments';
import { sweepPendingEvents } from '@/lib/integrations/outgoing-webhooks';
import { postToSlack } from '@/lib/integrations/slack';
import { SLACK_URL_PREFIX } from '@/lib/integrations/event-types';
import type { StoredIssueEvent } from '@/lib/events';
import { GET as exportAudit } from '../../routes/api/audit/+server';
import { localDb, makeProject, makeUser } from './fixtures';

let server: Server;
let url = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume();
    req.on('end', () => res.writeHead(204).end());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const later = () => new Date(Date.now() + 10 * 60_000);

async function auditExport(viewerId: string, projectId: string): Promise<string> {
  const event = {
    url: new URL(`http://localhost/api/audit?scope=project&id=${projectId}&format=json`),
    locals: { user: { id: viewerId } },
  } as unknown as Parameters<typeof exportAudit>[0];
  const res = await exportAudit(event);
  expect(res.status).toBe(200);
  return res.text();
}

describe.skipIf(!localDb)('issue.moved does not reveal the other project (gap D item 1)', () => {
  it('readers of the source learn the destination only as members of it; integrations never', async () => {
    const owner = await makeUser('mv-owner');
    const sourceOnly = await makeUser('mv-source-only');
    const both = await makeUser('mv-both');
    const a = await makeProject(owner, 'MVA', [sourceOnly, both]);
    const b = await makeProject(owner, 'MVB', [both]);
    // The audit log is for admins of the project.
    await db
      .update(projectMembers)
      .set({ role: 'admin' })
      .where(and(eq(projectMembers.projectId, a), inArray(projectMembers.userId, [sourceOnly, both])));
    const [bRow] = await db.select({ key: projects.ticketKey }).from(projects).where(eq(projects.id, b));
    const hidden = (text: string) => {
      expect(text).not.toContain(b);
      expect(text).not.toContain(bRow.key);
    };

    await db.insert(webhooks).values(
      [a, b].map((projectId) => ({
        id: crypto.randomUUID(),
        projectId,
        url,
        secret: 'shh',
        events: [],
        createdAt: new Date(),
      })),
    );
    await db
      .update(projects)
      .set({ slackWebhookUrl: `${SLACK_URL_PREFIX}services/T0/B0/x`, slackEvents: null })
      .where(eq(projects.id, a));

    const created = await issues.createIssue({ userId: owner }, a, { title: 'Travels' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const out = await issues.moveIssue({ userId: owner }, a, created.issue.id, b);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Back again: the issue's history now in A carries both moves' target-side rows.
    const back = await issues.moveIssue({ userId: both }, b, created.issue.id, a);
    expect(back.ok).toBe(true);
    if (!back.ok) return;

    // The stored rows keep the destination (nothing is rewritten).
    const stored = await db.select().from(activities).where(eq(activities.type, 'issue.moved'));
    const mine = stored.filter((row) => JSON.stringify(row.data).includes(created.issue.id) || row.ticketId === created.issue.id);
    expect(JSON.stringify(mine)).toContain(bRow.key);

    // Timeline: a member of A only sees "another project"; a member of both sees B.
    const forSourceOnly = await loadIssueTimeline(a, created.issue.id, sourceOnly);
    const movedLines = forSourceOnly.activities.filter((row) => row.type === 'issue.moved');
    expect(movedLines.length).toBe(2);
    hidden(JSON.stringify(forSourceOnly.activities));
    expect(movedLines.map((row) => row.data.summary)).toContain('moved from another project');
    const forBoth = await loadIssueTimeline(a, created.issue.id, both);
    expect(JSON.stringify(forBoth.activities)).toContain(bRow.key);

    // Audit export (the REST API over the audit log): same rule.
    const exportedForSourceOnly = await auditExport(sourceOnly, a);
    expect(exportedForSourceOnly).toContain('to another project');
    hidden(exportedForSourceOnly);
    expect(await auditExport(both, a)).toContain(bRow.key);

    // Webhooks: A's receiver gets nothing naming B (the source-side row is not
    // delivered; the history rows are A's own); B's receiver never gets A.
    await sweepPendingEvents({ now: later(), limit: 100 });
    const hooks = await db.select().from(webhooks).where(inArray(webhooks.projectId, [a, b]));
    const hookOf = (projectId: string) => hooks.find((h) => h.projectId === projectId)!.id;
    const deliveries = await db.select().from(webhookDeliveries).where(inArray(webhookDeliveries.webhookId, [hookOf(a), hookOf(b)]));
    const toA = deliveries.filter((d) => d.webhookId === hookOf(a));
    const toB = deliveries.filter((d) => d.webhookId === hookOf(b));
    expect(toA.some((d) => d.eventType === 'issue.moved')).toBe(true);
    expect(toB.some((d) => d.eventType === 'issue.moved')).toBe(true);
    hidden(JSON.stringify(toA.map((d) => d.payload)));
    const [aRow] = await db.select({ key: projects.ticketKey }).from(projects).where(eq(projects.id, a));
    const bPayloads = JSON.stringify(toB.map((d) => d.payload));
    expect(bPayloads).not.toContain(a);
    expect(bPayloads).not.toContain(`"${aRow.key}-`);

    // Slack for A: every move row of A, posted or not, names nothing of B.
    const aRows = (await db.select().from(activities).where(and(eq(activities.projectId, a), eq(activities.type, 'issue.moved')))).map(
      (row) => ({ ...row, data: row.data ?? {} }) as StoredIssueEvent,
    );
    expect(aRows.length).toBeGreaterThan(0);
    const posts: string[] = [];
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (!String(input instanceof Request ? input.url : input).startsWith(SLACK_URL_PREFIX)) return realFetch(input, init);
      posts.push(String(init?.body));
      return new Response(null, { status: 200 });
    });
    try {
      await postToSlack(aRows);
    } finally {
      fetchSpy.mockRestore();
    }
    hidden(posts.join('\n'));
  });
});
