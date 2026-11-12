import { describe, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';

// after() tasks are collected so the test decides when "after the response" runs.
const afterTasks: (() => unknown)[] = [];
vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: (task: () => unknown) => {
    afterTasks.push(task);
  },
}));

import { db } from '@/lib/db';
import { activities, projects, vcsWebhookDeliveries } from '@/db/schema';
import * as issues from '@/lib/issue-service';
import { hmacHex } from '@/lib/server/secrets';
import { retryInbound } from '@/lib/vcs/inbound';
import { POST } from '../../routes/api/webhooks/github/+server';
import { localDb, makeProject, makeUser } from './fixtures';

const SECRET = 'github-hook-secret';

function githubRequest(body: string, delivery: string, secret = SECRET) {
  return new Request('http://localhost/api/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'pull_request',
      'x-github-delivery': delivery,
      'x-hub-signature-256': `sha256=${hmacHex(body, secret)}`,
    },
    body,
  });
}
const post = (request: Request) => POST({ request } as unknown as Parameters<typeof POST>[0]);

describe.skipIf(!localDb)('provider webhooks are stored before the 202 and retried (gap D item 4)', () => {
  it('processing fails once → the delivery stays pending → the sweep completes it exactly once', async () => {
    const user = await makeUser('inb');
    const projectId = await makeProject(user, 'INB');
    const repo = `acme/inbound-${projectId.slice(0, 8)}`;
    await db.update(projects).set({ githubRepo: repo, githubWebhookSecret: SECRET }).where(eq(projects.id, projectId));
    const created = await issues.createIssue({ userId: user }, projectId, { title: 'Ship it' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const body = JSON.stringify({
      action: 'opened',
      repository: { full_name: repo },
      pull_request: {
        number: 42,
        title: `Fix ${created.issue.key}`,
        body: null,
        html_url: `https://github.com/${repo}/pull/42`,
        state: 'open',
        draft: false,
        merged: false,
        merged_at: null,
        head: { ref: 'feature' },
        user: { login: 'octocat' },
      },
    });
    const delivery = crypto.randomUUID();
    const rowsOf = () => db.select().from(vcsWebhookDeliveries).where(and(eq(vcsWebhookDeliveries.projectId, projectId)));
    const linkedEvents = async () =>
      (await db.select().from(activities).where(and(eq(activities.ticketId, created.issue.id), eq(activities.type, 'github.pr_linked')))).length;

    // A forged delivery is refused and stores nothing.
    expect((await post(githubRequest(body, crypto.randomUUID(), 'wrong-secret'))).status).toBe(403);
    expect(await rowsOf()).toEqual([]);

    // A transient failure while processing: the PR link cannot be written.
    const guard = `refuse_pr_${projectId.replaceAll('-', '')}`;
    await db.execute(sql.raw(`create function ${guard}() returns trigger language plpgsql as $$ begin raise exception 'transient'; end $$`));
    await db.execute(
      sql.raw(`create trigger ${guard} before insert on github_pull_request for each row when (new.project_id = '${projectId}') execute function ${guard}()`),
    );
    try {
      afterTasks.length = 0;
      const response = await post(githubRequest(body, delivery));
      expect(response.status).toBe(202);
      const [stored] = await rowsOf();
      expect(stored).toMatchObject({ provider: 'github', deliveryId: delivery, event: 'pull_request', attempts: 0, processedAt: null });
      // "After the response": the processing fails.
      await afterTasks[0]();
    } finally {
      await db.execute(sql.raw(`drop trigger ${guard} on github_pull_request`));
      await db.execute(sql.raw(`drop function ${guard}()`));
    }
    const [failed] = await rowsOf();
    expect(failed).toMatchObject({ attempts: 1, processedAt: null, error: expect.stringContaining('transient') });
    expect(failed.nextAttemptAt).not.toBeNull();
    expect(await linkedEvents()).toBe(0);

    // GitHub's manual redelivery (same delivery id) does not add a second row.
    afterTasks.length = 0;
    expect((await post(githubRequest(body, delivery))).status).toBe(202);
    expect((await rowsOf()).length).toBe(1);

    // Two sweeps race (cron + a lazy one): one claims the row, it completes once.
    const later = new Date(Date.now() + 24 * 60 * 60_000);
    const claimed = await Promise.all([retryInbound({ now: later }), retryInbound({ now: later })]);
    expect(claimed.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1);
    const [done] = await rowsOf();
    expect(done).toMatchObject({ attempts: 2, nextAttemptAt: null, error: null });
    expect(done.processedAt).not.toBeNull();
    expect(await linkedEvents()).toBe(1);

    // Nothing left to retry.
    expect(await retryInbound({ now: new Date(later.getTime() + 24 * 60 * 60_000) })).toBe(0);
    expect(await linkedEvents()).toBe(1);
  });
});
