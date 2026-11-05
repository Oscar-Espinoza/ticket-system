import { describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: () => undefined,
}));

import { db } from '@/lib/db';
import { activities, issueLabels, labels, projects, tickets } from '@/db/schema';
import * as issues from '@/lib/issue-service';
import { localDb, makeProject, makeUser } from './fixtures';

describe.skipIf(!localDb)('issue service against Postgres', () => {
  it('a create retried with the same client id returns the first issue (review finding #4)', async () => {
    const user = await makeUser('creator');
    const project = await makeProject(user, 'IDM');
    const clientId = crypto.randomUUID();

    const first = await issues.createIssue({ userId: user }, project, { title: 'Once' }, { id: clientId });
    const again = await issues.createIssue({ userId: user }, project, { title: 'Once' }, { id: clientId });
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.issue.id).toBe(first.issue.id);
    expect(again.issue.number).toBe(first.issue.number);

    // Two replays racing each other: one insert wins, the other answers with it.
    const raceId = crypto.randomUUID();
    const racing = await Promise.all([
      issues.createIssue({ userId: user }, project, { title: 'Race' }, { id: raceId }),
      issues.createIssue({ userId: user }, project, { title: 'Race' }, { id: raceId }),
    ]);
    expect(racing.every((r) => r.ok && r.issue.id === raceId)).toBe(true);

    const rows = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.projectId, project));
    expect(rows.length).toBe(2);
    const [p] = await db.select({ c: projects.ticketCounter }).from(projects).where(eq(projects.id, project));
    expect(p.c).toBe(2);
  });

  it('a client id owned by another user or project is refused', async () => {
    const a = await makeUser('a');
    const b = await makeUser('b');
    const pa = await makeProject(a, 'IDA', [b]);
    const clientId = crypto.randomUUID();
    const first = await issues.createIssue({ userId: a }, pa, { title: 'A’s' }, { id: clientId });
    expect(first.ok).toBe(true);
    const other = await issues.createIssue({ userId: b }, pa, { title: 'B’s' }, { id: clientId });
    expect(other.ok).toBe(false);
    const bad = await issues.createIssue({ userId: a }, pa, { title: 'x' }, { id: 'not-a-uuid' });
    expect(bad.ok).toBe(false);
  });

  it('two concurrent moves: the loser rewrites nothing (review finding #7)', async () => {
    const user = await makeUser('mover');
    const src = await makeProject(user, 'SRC');
    const toB = await makeProject(user, 'TOB');
    const toC = await makeProject(user, 'TOC');
    const now = new Date();
    // The same label name exists in B and C, so a losing move would swap it to C's.
    const [lblA, lblB, lblC] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(labels).values([
      { id: lblA, projectId: src, name: 'bug', color: '#f00', createdAt: now },
      { id: lblB, projectId: toB, name: 'bug', color: '#f00', createdAt: now },
      { id: lblC, projectId: toC, name: 'bug', color: '#f00', createdAt: now },
    ]);
    const created = await issues.createIssue({ userId: user }, src, { title: 'Contested', labelIds: [lblA] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.issue.id;

    const results = await Promise.all([
      issues.moveIssue({ userId: user }, src, id, toB),
      issues.moveIssue({ userId: user }, src, id, toC),
    ]);
    const winners = results.filter((r) => r.ok);
    expect(winners.length).toBe(1);

    const [row] = await db.select({ projectId: tickets.projectId }).from(tickets).where(eq(tickets.id, id));
    const target = row.projectId;
    expect([toB, toC]).toContain(target);
    const loser = target === toB ? toC : toB;

    const attached = await db.select({ labelId: issueLabels.labelId }).from(issueLabels).where(eq(issueLabels.ticketId, id));
    expect(attached.map((l) => l.labelId)).toEqual([target === toB ? lblB : lblC]);
    const strayActivity = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.ticketId, id), eq(activities.projectId, loser)));
    expect(strayActivity).toEqual([]);
    const [loserProject] = await db
      .select({ c: projects.ticketCounter })
      .from(projects)
      .where(eq(projects.id, loser));
    expect(loserProject.c).toBe(0);
  });

  it('a move whose subtree changed after it was read is refused (review finding #7)', async () => {
    const user = await makeUser('tree');
    const src = await makeProject(user, 'TRS');
    const dst = await makeProject(user, 'TRD');
    const parent = await issues.createIssue({ userId: user }, src, { title: 'Parent' });
    const child = await issues.createIssue({ userId: user }, src, { title: 'Late child' });
    expect(parent.ok && child.ok).toBe(true);
    if (!parent.ok || !child.ok) return;

    // moveIssue reads the tree in batch #1 and writes in batch #2: attach a
    // sub-issue in between, so the write runs with a stale plan.
    const realBatch = db.batch.bind(db);
    let calls = 0;
    const spy = vi.spyOn(db, 'batch').mockImplementation((async (queries: Parameters<typeof db.batch>[0]) => {
      calls += 1;
      if (calls === 2) {
        await db.update(tickets).set({ parentId: parent.issue.id }).where(eq(tickets.id, child.issue.id));
      }
      return realBatch(queries);
    }) as unknown as typeof db.batch);
    try {
      const moved = await issues.moveIssue({ userId: user }, src, parent.issue.id, dst);
      expect(moved.ok).toBe(false);
    } finally {
      spy.mockRestore();
    }
    const rows = await db
      .select({ projectId: tickets.projectId })
      .from(tickets)
      .where(inArray(tickets.id, [parent.issue.id, child.issue.id]));
    expect(rows.every((r) => r.projectId === src)).toBe(true);
    const [d] = await db.select({ c: projects.ticketCounter }).from(projects).where(eq(projects.id, dst));
    expect(d.c).toBe(0);

    // With the tree unchanged since the read, the move goes through with the child.
    const retry = await issues.moveIssue({ userId: user }, src, parent.issue.id, dst);
    expect(retry.ok && retry.moved).toBe(2);
  });
});
