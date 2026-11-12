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

// The `status` handler can be made to hang (a runner cut off mid-processing).
const statusHandler = vi.hoisted(() => ({ hang: false, calls: 0 }));
vi.mock('@/lib/github/sync', async (orig) => {
  const real = await orig<typeof import('@/lib/github/sync')>();
  return {
    ...real,
    syncStatus: (...args: Parameters<typeof real.syncStatus>) => {
      statusHandler.calls++;
      return statusHandler.hang ? new Promise<void>(() => undefined) : real.syncStatus(...args);
    },
  };
});

import { db } from '@/lib/db';
import { activities, githubPullRequests, projects, tickets, vcsWebhookDeliveries, workflowStates } from '@/db/schema';
import * as issues from '@/lib/issue-service';
import { hmacHex } from '@/lib/server/secrets';
import { recordInbound, retryInbound } from '@/lib/vcs/inbound';
import { MAX_ATTEMPTS } from '@/lib/integrations/outgoing-webhooks';
import { POST } from '../../routes/api/webhooks/github/+server';
import { localDb, makeProject, makeUser } from './fixtures';

const SECRET = 'github-hook-secret';

/** Make every github_pull_request insert/update of `projectId` fail until the returned cleanup runs. */
async function refusePullRequestWrites(projectId: string) {
  const guard = `refuse_pr_${projectId.replaceAll('-', '')}`;
  await db.execute(sql.raw(`create function ${guard}() returns trigger language plpgsql as $$ begin raise exception 'transient'; end $$`));
  await db.execute(
    sql.raw(
      `create trigger ${guard} before insert or update on github_pull_request for each row when (new.project_id = '${projectId}') execute function ${guard}()`,
    ),
  );
  return async () => {
    await db.execute(sql.raw(`drop trigger ${guard} on github_pull_request`));
    await db.execute(sql.raw(`drop function ${guard}()`));
  };
}

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
      expect(stored).toMatchObject({ provider: 'github', deliveryId: delivery, event: 'pull_request', attempts: 1, processedAt: null });
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

    // Nothing left to retry for it (other suites' rows may be swept meanwhile).
    await retryInbound({ now: new Date(later.getTime() + 24 * 60 * 60_000) });
    expect((await rowsOf())[0]).toMatchObject({ attempts: 2, processedAt: done.processedAt });
    expect(await linkedEvents()).toBe(1);
  });

  it('a stale retried snapshot never reverts a merged PR, its issue, or adds a second pr_merged; reopen still applies', async () => {
    const user = await makeUser('inb-order');
    const projectId = await makeProject(user, 'ORD');
    const repo = `acme/order-${projectId.slice(0, 8)}`;
    await db.update(projects).set({ githubRepo: repo, githubWebhookSecret: SECRET }).where(eq(projects.id, projectId));
    const created = await issues.createIssue({ userId: user }, projectId, { title: 'Order' });
    if (!created.ok) throw new Error(created.error);
    const key = created.issue.key;
    const at = (minute: number) => new Date(Date.UTC(2026, 10, 12, 10, minute)).toISOString();
    // minute null = a payload without the provider's updated_at (merged is terminal regardless).
    const pullRequest = (number: number, action: string, state: 'open' | 'closed', merged: boolean, minute: number | null, ref = key) =>
      JSON.stringify({
        action,
        repository: { full_name: repo },
        pull_request: {
          number,
          title: `Fix ${ref}`,
          body: null,
          html_url: `https://github.com/${repo}/pull/${number}`,
          state,
          draft: false,
          merged,
          merged_at: merged ? at(minute ?? 59) : null,
          ...(minute === null ? {} : { updated_at: at(minute) }),
          head: { ref: `feature-${number}` },
          user: { login: 'octocat' },
        },
      });
    const deliver = async (body: string) => {
      afterTasks.length = 0;
      expect((await post(githubRequest(body, crypto.randomUUID()))).status).toBe(202);
      for (const task of afterTasks.splice(0)) await task();
    };
    const link = async (number: number) =>
      (await db.select().from(githubPullRequests).where(and(eq(githubPullRequests.projectId, projectId), eq(githubPullRequests.number, number))))[0];
    const events = async (type: string) =>
      (await db.select().from(activities).where(and(eq(activities.ticketId, created.issue.id), eq(activities.type, type)))).length;
    const stateOfIssue = async () =>
      (
        await db
          .select({ name: workflowStates.name })
          .from(tickets)
          .innerJoin(workflowStates, eq(workflowStates.id, tickets.stateId))
          .where(eq(tickets.id, created.issue.id))
      )[0].name;
    const later = () => new Date(Date.now() + 24 * 60 * 60_000);

    // `opened` fails once; `closed`+merged is processed; then the stale `opened` is retried.
    const cleanup = await refusePullRequestWrites(projectId);
    try {
      await deliver(pullRequest(7, 'opened', 'open', false, null));
    } finally {
      await cleanup();
    }
    expect(await link(7)).toBeUndefined();
    await deliver(pullRequest(7, 'closed', 'closed', true, null));
    expect(await stateOfIssue()).toBe('Done');
    expect(await retryInbound({ now: later(), limit: 200 })).toBeGreaterThanOrEqual(1);
    expect(await link(7)).toMatchObject({ state: 'merged', mergedAt: new Date(at(59)) });
    expect(await stateOfIssue()).toBe('Done');
    // A later edit of the merged PR: still one pr_merged.
    await deliver(pullRequest(7, 'edited', 'closed', true, null));
    expect(await events('github.pr_merged')).toBe(1);
    expect(await link(7)).toMatchObject({ state: 'merged' });

    // Merged, then reopened BY HAND: the stale `opened` retried later moves nothing.
    const other = await issues.createIssue({ userId: user }, projectId, { title: 'Reopened by hand' });
    if (!other.ok) throw new Error(other.error);
    const stateOf = async (id: string) =>
      (await db.select({ name: workflowStates.name }).from(tickets).innerJoin(workflowStates, eq(workflowStates.id, tickets.stateId)).where(eq(tickets.id, id)))[0].name;
    const cleanup3 = await refusePullRequestWrites(projectId);
    try {
      await deliver(pullRequest(9, 'opened', 'open', false, 20, other.issue.key));
    } finally {
      await cleanup3();
    }
    await deliver(pullRequest(9, 'closed', 'closed', true, 21, other.issue.key));
    expect(await stateOf(other.issue.id)).toBe('Done');
    const [todo] = await db.select({ id: workflowStates.id }).from(workflowStates).where(and(eq(workflowStates.projectId, projectId), eq(workflowStates.name, 'Todo')));
    expect((await issues.updateIssueFields({ userId: user }, projectId, other.issue.id, { stateId: todo.id })).ok).toBe(true);
    expect(await retryInbound({ now: later(), limit: 200 })).toBeGreaterThanOrEqual(1);
    expect(await stateOf(other.issue.id)).toBe('Todo');

    // Closed (not merged) → reopened still applies.
    await deliver(pullRequest(8, 'opened', 'open', false, 10));
    await deliver(pullRequest(8, 'closed', 'closed', false, 11));
    expect(await link(8)).toMatchObject({ state: 'closed' });
    await deliver(pullRequest(8, 'reopened', 'open', false, 12));
    expect(await link(8)).toMatchObject({ state: 'open' });
    // A `closed` that failed, retried after a newer `reopened`, is older: not applied.
    const cleanup2 = await refusePullRequestWrites(projectId);
    try {
      await deliver(pullRequest(8, 'closed', 'closed', false, 13));
    } finally {
      await cleanup2();
    }
    await deliver(pullRequest(8, 'reopened', 'open', false, 14));
    const closedBefore = await events('github.pr_closed');
    expect(await retryInbound({ now: later(), limit: 200 })).toBeGreaterThanOrEqual(1);
    expect(await link(8)).toMatchObject({ state: 'open' });
    expect(await events('github.pr_closed')).toBe(closedBefore);
  });

  it('a runner cut off every time stops after MAX_ATTEMPTS; a manual redelivery of a given-up row starts over', async () => {
    const user = await makeUser('inb-attempts');
    const projectId = await makeProject(user, 'ATT');
    const deliveryId = crypto.randomUUID();
    const record = () =>
      recordInbound({ provider: 'github', deliveryId, event: 'status', payload: {}, targets: [{ projectId }] });
    const rowOf = async () => (await db.select().from(vcsWebhookDeliveries).where(eq(vcsWebhookDeliveries.projectId, projectId)))[0];
    expect((await record()).length).toBe(1);
    expect(await rowOf()).toMatchObject({ attempts: 1 });
    // A duplicate of a pending row is skipped.
    expect(await record()).toEqual([]);

    // Its last attempt but one ran out; the next claim's runner is cut off (never returns).
    await db
      .update(vcsWebhookDeliveries)
      .set({ attempts: MAX_ATTEMPTS - 1, nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(vcsWebhookDeliveries.projectId, projectId));
    statusHandler.hang = true;
    statusHandler.calls = 0;
    void retryInbound({ limit: 50 });
    await vi.waitFor(() => expect(statusHandler.calls).toBe(1));
    expect(await rowOf()).toMatchObject({ attempts: MAX_ATTEMPTS, processedAt: null });

    // Its lease expires: no further claim, and the row is marked given up.
    const afterLease = new Date(Date.now() + 60 * 60_000);
    await retryInbound({ now: afterLease, limit: 50 });
    expect(statusHandler.calls).toBe(1);
    const given = await rowOf();
    expect(given).toMatchObject({ attempts: MAX_ATTEMPTS, processedAt: null, nextAttemptAt: null });
    expect(given.error).toContain('gave up');

    // A manual "Redeliver" (same delivery id) starts it over.
    statusHandler.hang = false;
    const again = await record();
    expect(again.length).toBe(1);
    expect(await rowOf()).toMatchObject({ attempts: 1, error: null });
  });
});
