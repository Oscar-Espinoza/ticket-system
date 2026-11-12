import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

// No after-response fan-out: these tests play the part of a process that died
// right after the mutation committed.
vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: () => undefined,
}));
vi.mock('@/lib/events', async (orig) => ({
  ...(await orig<typeof import('@/lib/events')>()),
  publishIssueEvents: () => undefined,
}));

import { db } from '@/lib/db';
import { activities, projects, webhookDeliveries, webhooks } from '@/db/schema';
import * as issues from '@/lib/issue-service';
import { sweepPendingEvents } from '@/lib/integrations/outgoing-webhooks';
import { createCommentAs, updateCommentAs } from '@/lib/comments';
import { postToSlack } from '@/lib/integrations/slack';
import { SLACK_URL_PREFIX } from '@/lib/integrations/event-types';
import { localDb, makeProject, makeUser } from './fixtures';
import type { WebhookPayload } from '@/lib/integrations/outgoing-webhooks';

let server: Server;
let url = '';
const received: { event: string; delivery: string; body: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received.push({
        event: String(req.headers['x-webhook-event']),
        delivery: String(req.headers['x-webhook-delivery']),
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const later = () => new Date(Date.now() + 10 * 60_000);

describe.skipIf(!localDb)('durable webhook dispatch (review finding #9)', () => {
  it('a created issue’s event is stored pending in the same transaction, then swept once', async () => {
    const user = await makeUser('hook');
    const project = await makeProject(user, 'WHK');
    const hookId = crypto.randomUUID();
    await db.insert(webhooks).values({
      id: hookId,
      projectId: project,
      url,
      secret: 'shh',
      events: ['issue.created'],
      createdAt: new Date(),
    });

    const created = await issues.createIssue({ userId: user }, project, { title: 'Durable' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const [event] = await db
      .select()
      .from(activities)
      .where(and(eq(activities.ticketId, created.issue.id), eq(activities.type, 'issue.created')));
    expect(event.webhookPendingProjectId).toBe(project);
    expect(event.data).toMatchObject({ key: created.issue.key, title: 'Durable' });

    // Two sweeps racing (cron + a lazy one): one delivery row, one request.
    const swept = await Promise.all([sweepPendingEvents({ now: later() }), sweepPendingEvents({ now: later() })]);
    expect(swept.some((n) => n > 0)).toBe(true);
    const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, hookId));
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ eventId: event.id, status: 204 });
    expect(received.filter((r) => r.delivery === event.id).length).toBe(1);

    const [after] = await db.select().from(activities).where(eq(activities.id, event.id));
    expect(after.webhookPendingProjectId).toBeNull();
    // Sweeping again doesn't resend it.
    await sweepPendingEvents({ now: later() });
    expect(received.filter((r) => r.delivery === event.id).length).toBe(1);
  });

  it('a moved issue’s events carry the new keys and are durable', async () => {
    const user = await makeUser('mv');
    const src = await makeProject(user, 'MVS');
    const dst = await makeProject(user, 'MVD');
    const created = await issues.createIssue({ userId: user }, src, { title: 'Moving' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const moved = await issues.moveIssue({ userId: user }, src, created.issue.id, dst);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    const rows = await db
      .select({ projectId: activities.projectId, data: activities.data, pending: activities.webhookPendingProjectId })
      .from(activities)
      .where(eq(activities.type, 'issue.moved'));
    const mine = rows.filter((r) => r.data.fromKey === created.issue.key);
    expect(mine.length).toBe(2);
    const inSource = mine.find((r) => r.projectId === src)!;
    const inTarget = mine.find((r) => r.projectId === dst)!;
    expect(inSource.data).toMatchObject({ toKey: moved.issue.key, summary: `moved ${created.issue.key} to ${moved.issue.key}` });
    expect(inTarget.data).toMatchObject({ key: moved.issue.key, toKey: moved.issue.key });
    expect(inTarget.pending).toBe(dst);
  });

  it('a pending event still goes to the project it happened in after the issue moves (Astra review #5)', async () => {
    const user = await makeUser('mvh');
    const src = await makeProject(user, 'MHS');
    const dst = await makeProject(user, 'MHD');
    const hookId = crypto.randomUUID();
    await db.insert(webhooks).values({
      id: hookId,
      projectId: src,
      url,
      secret: 'shh',
      events: ['issue.created'],
      createdAt: new Date(),
    });
    const created = await issues.createIssue({ userId: user }, src, { title: 'Moved before sweep' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const moved = await issues.moveIssue({ userId: user }, src, created.issue.id, dst);
    expect(moved.ok).toBe(true);

    await sweepPendingEvents({ now: later() });
    const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, hookId));
    expect(rows.map((r) => r.eventType)).toEqual(['issue.created']);
  });

  it('an event swept after its issue moved to a private project carries nothing of the issue’s new life (follow-up 2026-11-12)', async () => {
    const owner = await makeUser('leak-owner');
    // Member of the private target project only.
    const insider = await makeUser('secret-assignee-name');
    const src = await makeProject(owner, 'LKA');
    const dst = await makeProject(owner, 'LKB', [insider]);
    // Both projects have a receiver, so one sweep mixes A's and B's events and
    // loads B's issue into the shared context — the case a real sweep hits.
    const hookA = crypto.randomUUID();
    const hookB = crypto.randomUUID();
    await db.insert(webhooks).values(
      [hookA, hookB].map((id, i) => ({
        id,
        projectId: i === 0 ? src : dst,
        url,
        secret: 'shh',
        events: [],
        createdAt: new Date(),
      })),
    );

    const created = await issues.createIssue({ userId: owner }, src, { title: 'Public title' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const moved = await issues.moveIssue({ userId: owner }, src, created.issue.id, dst);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const edited = await issues.updateIssueFields({ userId: owner }, dst, created.issue.id, {
      title: 'Secret private title',
      assigneeId: insider,
    });
    expect(edited.ok).toBe(true);

    // The pending events of both projects are swept only now, in one sweep.
    await sweepPendingEvents({ now: later() });
    const deliveries = (hookId: string) =>
      db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, hookId));
    const rowsA = await deliveries(hookA);
    expect(rowsA.map((r) => r.eventType)).toEqual(['issue.created']);
    const createdA = rowsA[0].payload as unknown as WebhookPayload;
    // What the event recorded when it happened stays; the issue's current row is not used.
    expect(createdA.issue).toBeNull();
    expect(createdA.data).toMatchObject({ key: created.issue.key, title: 'Public title' });

    const sentA = received.filter((r) => rowsA.some((row) => row.eventId === r.delivery));
    expect(sentA.length).toBe(1);
    for (const text of [...rowsA.map((r) => JSON.stringify(r.payload)), ...sentA.map((r) => r.body)]) {
      expect(text).not.toContain('Secret private title');
      expect(text).not.toContain('secret-assignee-name');
      expect(text).not.toContain(insider);
    }

    // B's own receiver gets the issue as it is now.
    const rowsB = await deliveries(hookB);
    const updatedB = rowsB.find((r) => r.eventType === 'issue.updated');
    expect(updatedB).toBeDefined();
    expect(updatedB!.payload as unknown as WebhookPayload).toMatchObject({
      issue: { id: created.issue.id, title: 'Secret private title', assignee: { id: insider, name: 'secret-assignee-name' } },
    });
  });

  it('Slack for the source project posts what a comment recorded, not the issue’s later life in a private project', async () => {
    const owner = await makeUser('slack-owner');
    const src = await makeProject(owner, 'SLA');
    const dst = await makeProject(owner, 'SLB');
    await db
      .update(projects)
      .set({ slackWebhookUrl: `${SLACK_URL_PREFIX}services/T0/B0/x`, slackEvents: ['commented'] })
      .where(eq(projects.id, src));

    const created = await issues.createIssue({ userId: owner }, src, { title: 'Public title' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const commented = await createCommentAs({ userId: owner }, src, {
      ticketId: created.issue.id,
      body: 'Public comment',
    });
    expect(commented.ok).toBe(true);
    if (!commented.ok) return;
    const [event] = await db
      .select()
      .from(activities)
      .where(and(eq(activities.ticketId, created.issue.id), eq(activities.type, 'comment.created')));

    const moved = await issues.moveIssue({ userId: owner }, src, created.issue.id, dst);
    expect(moved.ok).toBe(true);
    expect(await issues.updateIssueFields({ userId: owner }, dst, created.issue.id, { title: 'Secret private title' })).toMatchObject({ ok: true });
    expect(
      await updateCommentAs({ userId: owner }, dst, { commentId: commented.comment.id, body: 'Secret private comment' }),
    ).toMatchObject({ ok: true });

    const posts: string[] = [];
    // Only Slack posts are captured. The Neon HTTP driver also uses fetch, and
    // its queries (postToSlack reads the project) must reach the database: let
    // through only the local Neon proxy (NEON_PROXY_HOST), and throw on any
    // other URL so nothing here can reach the real network.
    const realFetch = globalThis.fetch;
    const proxyHost = process.env.NEON_PROXY_HOST;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.startsWith(SLACK_URL_PREFIX)) {
        if (proxyHost && new URL(url).host === proxyHost) return realFetch(input, init);
        throw new Error(`unexpected network call in a test: ${url}`);
      }
      posts.push(String(init?.body));
      return new Response(null, { status: 200 });
    });
    try {
      await postToSlack([{ ...event, projectId: src }]);
    } finally {
      fetchSpy.mockRestore();
    }
    expect(posts.length).toBe(1);
    expect(posts[0]).toContain('Public comment');
    expect(posts[0]).toContain('Public title');
    expect(posts[0]).not.toContain('Secret private');
  });

  it('a comment and its comment.created event commit together (Astra review #4)', async () => {
    const user = await makeUser('cm');
    const project = await makeProject(user, 'CMT');
    const created = await issues.createIssue({ userId: user }, project, { title: 'Discuss' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await createCommentAs({ userId: user }, project, { ticketId: created.issue.id, body: 'First!' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [event] = await db
      .select()
      .from(activities)
      .where(and(eq(activities.ticketId, created.issue.id), eq(activities.type, 'comment.created')));
    expect(event.data).toMatchObject({ commentId: result.comment.id });
    expect(event.webhookPendingProjectId).toBe(project);
  });
});
