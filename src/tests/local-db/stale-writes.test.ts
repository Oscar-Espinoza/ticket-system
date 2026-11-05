import { describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: () => undefined,
}));

import { db } from '@/lib/db';
import { activities, issueLabels, labels, tickets } from '@/db/schema';
import * as issues from '@/lib/issue-service';
import { localDb, makeProject, makeUser } from './fixtures';

describe.skipIf(!localDb)('writes planned before a concurrent move (Sol review #4, #5)', () => {
  it('a stale label update after the issue moved rewrites nothing', async () => {
    const user = await makeUser('stale');
    const a = await makeProject(user, 'STA');
    const b = await makeProject(user, 'STB');
    const now = new Date();
    const [la, lb] = [crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(labels).values([
      { id: la, projectId: a, name: 'a-only', color: '#000', createdAt: now },
      { id: lb, projectId: b, name: 'kept', color: '#000', createdAt: now },
    ]);
    const kept = crypto.randomUUID();
    await db.insert(labels).values({ id: kept, projectId: a, name: 'kept', color: '#000', createdAt: now });
    const created = await issues.createIssue({ userId: user }, a, { title: 'X', labelIds: [kept] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.issue.id;

    // bulkUpdate reads (batch 1: context) then writes (batch 2): move in between.
    const realBatch = db.batch.bind(db);
    let calls = 0;
    const spy = vi.spyOn(db, 'batch').mockImplementation((async (queries: Parameters<typeof db.batch>[0]) => {
      calls += 1;
      if (calls === 2) {
        spy.mockRestore();
        const moved = await issues.moveIssue({ userId: user }, a, id, b);
        expect(moved.ok).toBe(true);
      }
      return realBatch(queries);
    }) as unknown as typeof db.batch);
    const result = await issues.updateIssueFields({ userId: user }, a, id, { labelIds: [la] });
    spy.mockRestore();
    expect(result.ok).toBe(false);

    const attached = await db.select({ labelId: issueLabels.labelId }).from(issueLabels).where(eq(issueLabels.ticketId, id));
    expect(attached.map((l) => l.labelId)).toEqual([lb]);
    const stray = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.ticketId, id), eq(activities.projectId, a)));
    expect(stray).toEqual([]);
  });

  it('a sub-issue created under a parent that moves meanwhile is refused', async () => {
    const user = await makeUser('kid');
    const a = await makeProject(user, 'KDA');
    const b = await makeProject(user, 'KDB');
    const parent = await issues.createIssue({ userId: user }, a, { title: 'Parent' });
    expect(parent.ok).toBe(true);
    if (!parent.ok) return;

    // createIssue validates in batch 1 (loadContext) and writes in batch 2: move in between.
    const realBatch = db.batch.bind(db);
    let calls = 0;
    const spy = vi.spyOn(db, 'batch').mockImplementation((async (queries: Parameters<typeof db.batch>[0]) => {
      calls += 1;
      if (calls === 2) {
        spy.mockRestore();
        const result = await issues.moveIssue({ userId: user }, a, parent.issue.id, b);
        expect(result.ok).toBe(true);
      }
      return realBatch(queries);
    }) as unknown as typeof db.batch);
    const child = await issues.createIssue({ userId: user }, a, { title: 'Child', parentId: parent.issue.id });
    spy.mockRestore();
    expect(child.ok).toBe(false);
    const orphans = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.projectId, a), eq(tickets.parentId, parent.issue.id)));
    expect(orphans).toEqual([]);
  });
});
