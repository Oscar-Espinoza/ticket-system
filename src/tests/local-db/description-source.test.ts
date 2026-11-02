import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: () => undefined,
}));

import { db } from '@/lib/db';
import { tickets } from '@/db/schema';
import * as issues from '@/lib/issue-service';
import { reconcileTarget } from '@/components/collab/use-collab-editor';
import { localDb, makeProject, makeUser } from './fixtures';

const source = async (id: string) =>
  (await db.select({ s: tickets.descriptionSource }).from(tickets).where(eq(tickets.id, id)))[0].s;

describe('reconcileTarget (review finding #6)', () => {
  it('trusts the doc only over its own projection, and reads the server copy', () => {
    expect(reconcileTarget({ markdown: 'server', source: 'collab', rev: 3 }, 'stale page', 'markdown')).toEqual({
      stored: 'server',
      winner: 'collab',
    });
    expect(reconcileTarget({ markdown: 'api edit', source: 'external', rev: 4 }, 'stale page', 'markdown')).toEqual({
      stored: 'api edit',
      winner: 'markdown',
    });
    expect(reconcileTarget({ markdown: 'legacy', source: null, rev: 0 }, 'x', 'markdown').winner).toBe('markdown');
    expect(reconcileTarget(undefined, 'doc', 'collab')).toEqual({ stored: 'doc', winner: 'collab' });
    // The doc already adopted external revision 4 (another editor, marker in flight): trust the doc.
    expect(reconcileTarget({ markdown: 'api edit', source: 'external', rev: 4 }, 'x', 'markdown', 4).winner).toBe('collab');
    // A later external write (rev 5), even one restoring older text, is new to the doc.
    expect(reconcileTarget({ markdown: 'api edit', source: 'external', rev: 5 }, 'x', 'markdown', 4).winner).toBe('markdown');
  });
});

describe.skipIf(!localDb)('description source tracking (review finding #6)', () => {
  it('collab saves mark collab, every other write marks external, adoption is compare-and-set', async () => {
    const user = await makeUser('desc');
    const project = await makeProject(user, 'DSC');
    const created = await issues.createIssue({ userId: user }, project, { title: 'Doc' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.issue.id;

    await issues.updateIssueFields({ userId: user }, project, id, { description: 'from the doc' }, { descriptionSource: 'collab' });
    expect(await source(id)).toBe('collab');

    await issues.updateIssueFields({ userId: user }, project, id, { description: 'from the API' });
    expect(await source(id)).toBe('external');
    const rev = async () =>
      (await db.select({ r: tickets.descriptionRev }).from(tickets).where(eq(tickets.id, id)))[0].r;
    expect(await rev()).toBe(1);
    await issues.updateIssueFields({ userId: user }, project, id, { description: 'from the doc again' }, { descriptionSource: 'collab' });
    expect(await rev()).toBe(1);
    await issues.updateIssueFields({ userId: user }, project, id, { description: 'from the API' });
    expect(await rev()).toBe(2);

    // A title-only edit doesn't touch the marker.
    await issues.updateIssueFields({ userId: user }, project, id, { title: 'Renamed' });
    expect(await source(id)).toBe('external');

    // Adopting text that is no longer stored (a newer external write) does nothing.
    expect(await issues.markDescriptionProjected(project, id, 'from the doc')).toBe(false);
    expect(await source(id)).toBe('external');
    expect(await issues.markDescriptionProjected(project, id, '  from the API \n')).toBe(true);
    expect(await source(id)).toBe('collab');
    // Wrong project: refused.
    expect(await issues.markDescriptionProjected(crypto.randomUUID(), id, 'from the API')).toBe(false);
  });
});
