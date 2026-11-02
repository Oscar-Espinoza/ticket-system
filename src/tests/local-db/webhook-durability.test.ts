import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

// No after-response fan-out: these tests play the part of a process that died
// right after the mutation committed.
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: () => undefined,
}));
vi.mock('@/lib/events', async (orig) => ({
  ...(await orig<typeof import('@/lib/events')>()),
  publishIssueEvents: () => undefined,
}));

import { db } from '@/lib/db';
import { activities, webhookDeliveries, webhooks } from '@/db/schema';
import * as issues from '@/lib/issue-service';
import { sweepPendingEvents } from '@/lib/integrations/outgoing-webhooks';
import { createCommentAs } from '@/lib/comments';
import { localDb, makeProject, makeUser } from './fixtures';

let server: Server;
let url = '';
const received: { event: string; delivery: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    received.push({
      event: String(req.headers['x-webhook-event']),
      delivery: String(req.headers['x-webhook-delivery']),
    });
    req.resume();
    req.on('end', () => res.writeHead(204).end());
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
