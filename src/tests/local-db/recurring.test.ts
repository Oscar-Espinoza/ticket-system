import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: () => undefined,
}));

import { db } from '@/lib/db';
import { recurringIssues, tickets } from '@/db/schema';
import { createFromSchedule, occurrenceIssueId, runDueRecurringIssues } from '@/lib/recurring';
import { localDb, makeProject, makeUser } from './fixtures';

async function makeSchedule(projectId: string, createdById: string, title: string) {
  const id = crypto.randomUUID();
  const due = new Date('2026-10-01T00:00:00Z');
  await db.insert(recurringIssues).values({
    id,
    projectId,
    createdById,
    title,
    schedule: { freq: 'daily', interval: 1, start: '2026-10-01' },
    nextRunAt: due,
    createdAt: due,
    updatedAt: due,
  });
  const [row] = await db.select().from(recurringIssues).where(eq(recurringIssues.id, id));
  return row;
}

const NOW = new Date('2026-10-05T09:00:00Z');
const count = async (projectId: string) =>
  (await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.projectId, projectId))).length;

describe.skipIf(!localDb)('recurring runner (review finding #8)', () => {
  it('an interrupted run (issue made, schedule not advanced) is finished without a duplicate', async () => {
    const user = await makeUser('rec');
    const project = await makeProject(user, 'REC');
    const row = await makeSchedule(project, user, 'Weekly report');

    // What a run that died right after creating the issue leaves behind.
    const crashed = await createFromSchedule(row, NOW, occurrenceIssueId(row.id, row.nextRunAt));
    expect(crashed.ok).toBe(true);

    const result = await runDueRecurringIssues(NOW, project);
    expect(result).toEqual({ created: 1, failed: 0 });
    expect(await count(project)).toBe(1);
    const [after] = await db.select().from(recurringIssues).where(eq(recurringIssues.id, row.id));
    expect(after.nextRunAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('a failed create leaves the occurrence due for the next run', async () => {
    const user = await makeUser('rec2');
    const project = await makeProject(user, 'RCF');
    const row = await makeSchedule(project, user, '');  // empty title → createIssue fails
    const result = await runDueRecurringIssues(NOW, project);
    expect(result).toEqual({ created: 0, failed: 1 });
    const [after] = await db.select().from(recurringIssues).where(eq(recurringIssues.id, row.id));
    expect(after.nextRunAt.getTime()).toBe(row.nextRunAt.getTime());
  });

  it('overlapping runs create one issue per occurrence', async () => {
    const user = await makeUser('rec3');
    const project = await makeProject(user, 'RCO');
    await makeSchedule(project, user, 'Standup notes');
    const results = await Promise.all([
      runDueRecurringIssues(NOW, project),
      runDueRecurringIssues(NOW, project),
      runDueRecurringIssues(NOW, project),
    ]);
    expect(results.reduce((n, r) => n + r.created, 0)).toBe(1);
    expect(await count(project)).toBe(1);
  });
});
