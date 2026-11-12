import { describe, expect, it, vi } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';

// No after-response fan-out: these tests play the part of a process that died
// right after the mutation committed. Whatever must survive is in the database.
vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: () => undefined,
}));
vi.mock('@/lib/events', async (orig) => ({
  ...(await orig<typeof import('@/lib/events')>()),
  publishIssueEvents: () => undefined,
}));

import { db } from '@/lib/db';
import { activities, githubPullRequests, projects, tickets, workflowStates } from '@/db/schema';
import { commitWithEvents } from '@/lib/events';
import { loadIssueTimeline } from '@/lib/comments';
import * as issues from '@/lib/issue-service';
import { syncClosingCommits, syncPullRequest } from '@/lib/vcs/automation';
import { applyPolicyToOpenIssues } from '@/lib/sla-server';
import { run as runSlaJob } from '@/lib/cron/jobs/sla';
import { localDb, makeProject, makeUser } from './fixtures';

const eventsOf = (ticketId: string, type: string) =>
  db
    .select()
    .from(activities)
    .where(and(eq(activities.ticketId, ticketId), eq(activities.type, type)));

async function vcsProject(projectId: string) {
  const [row] = await db
    .select({ id: projects.id, ticketKey: projects.ticketKey })
    .from(projects)
    .where(eq(projects.id, projectId));
  return { ...row, prOpenStateId: null, prMergeStateId: null };
}

describe.skipIf(!localDb)('events commit with their mutation (review follow-up, 2026-11-12)', () => {
  it('commitWithEvents: an event that cannot be written takes the mutation down with it', async () => {
    const user = await makeUser('cwe');
    const project = await makeProject(user, 'CWE');
    const stateId = crypto.randomUUID();
    const insertState = db.insert(workflowStates).values({
      id: stateId,
      projectId: project,
      name: 'Review',
      type: 'started',
      color: '#888888',
      position: 9,
      createdAt: new Date(),
    });
    // The activity row fails (no such project): the old pattern kept the state.
    await expect(
      commitWithEvents(
        [insertState],
        [{ projectId: crypto.randomUUID(), ticketId: null, actorId: user, type: 'workflow_state.created' }],
      ),
    ).rejects.toThrow();
    expect(await db.select().from(workflowStates).where(eq(workflowStates.id, stateId))).toEqual([]);
  });

  it('PR sync: the PR row and its github.* events commit together (a refused event rolls the row back), and a redelivery adds none', async () => {
    const user = await makeUser('prs');
    const projectId = await makeProject(user, 'PRS');
    const project = await vcsProject(projectId);
    const created = await issues.createIssue({ userId: user }, projectId, { title: 'Linked' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const pr = {
      provider: 'github' as const,
      repo: 'acme/app',
      number: 7,
      title: `Fix ${created.issue.key}`,
      body: null,
      url: 'https://github.com/acme/app/pull/7',
      state: 'open' as const,
      draft: true,
      branch: null,
      author: null,
      mergedAt: null,
      updatedAt: null,
    };
    // The event cannot be written (a trigger refuses it, for this issue only):
    // the PR row must not stay behind, or the redelivery would find nothing
    // changed and the event would be lost for good.
    const guard = `refuse_pr_linked_${created.issue.id.replaceAll('-', '')}`;
    await db.execute(
      sql.raw(`create function ${guard}() returns trigger language plpgsql as $$ begin raise exception 'event refused'; end $$`),
    );
    await db.execute(
      sql.raw(
        `create trigger ${guard} before insert on activity for each row when (new.type = 'github.pr_linked' and new.ticket_id = '${created.issue.id}') execute function ${guard}()`,
      ),
    );
    try {
      await syncPullRequest(project, pr, 'updated').catch(() => undefined);
      expect(await db.select().from(githubPullRequests).where(eq(githubPullRequests.ticketId, created.issue.id))).toEqual([]);
      expect(await eventsOf(created.issue.id, 'github.pr_linked')).toEqual([]);
    } finally {
      await db.execute(sql.raw(`drop trigger ${guard} on activity`));
      await db.execute(sql.raw(`drop function ${guard}()`));
    }

    await syncPullRequest(project, pr, 'updated');
    const linked = await eventsOf(created.issue.id, 'github.pr_linked');
    expect(linked.length).toBe(1);
    expect(linked[0].webhookPendingProjectId).toBe(projectId);
    const prRows = await db.select().from(githubPullRequests).where(eq(githubPullRequests.ticketId, created.issue.id));
    expect(prRows.length).toBe(1);

    await syncPullRequest(project, pr, 'updated');
    expect((await eventsOf(created.issue.id, 'github.pr_linked')).length).toBe(1);
  });

  it('closing commit: github.commit_closed commits with the state change it explains, sorted just after it', async () => {
    const user = await makeUser('cc');
    const projectId = await makeProject(user, 'CCL');
    const project = await vcsProject(projectId);
    const created = await issues.createIssue({ userId: user }, projectId, { title: 'Close me' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const commit = { id: 'abcdef1234567890', message: `Fixes ${created.issue.key}`, url: 'https://example.test/c' };
    await syncClosingCommits(project, { provider: 'github', repo: 'acme/app', commits: [commit] });

    const [closed] = await eventsOf(created.issue.id, 'github.commit_closed');
    const [updated] = await eventsOf(created.issue.id, 'issue.updated');
    expect(closed?.webhookPendingProjectId).toBe(projectId);
    expect(updated).toBeDefined();
    // Written by the same batch as the state change, one millisecond after it, so
    // the timeline (which sorts by time) always shows the pair in the same order.
    expect(closed.createdAt.getTime() - updated.createdAt.getTime()).toBe(1);
    const timeline = await loadIssueTimeline(projectId, created.issue.id, user);
    const order = timeline.activities.map((a) => a.type).filter((t) => t === 'github.commit_closed' || t === 'issue.updated');
    expect(order).toEqual(['issue.updated', 'github.commit_closed']);
    const [ticket] = await db
      .select({ type: workflowStates.type })
      .from(tickets)
      .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
      .where(eq(tickets.id, created.issue.id));
    expect(ticket.type).toBe('completed');

    // Nothing changes (already done): no stray "closed by commit" line.
    await issues.updateIssueFields(
      { userId: user },
      projectId,
      created.issue.id,
      { stateId: await doneState(projectId) },
      { extraEvents: () => [{ projectId, ticketId: created.issue.id, actorId: null, type: 'github.commit_closed' }] },
    );
    expect((await eventsOf(created.issue.id, 'github.commit_closed')).length).toBe(1);
  });

  it('SLA breach job: the breach flag and issue.sla_breached commit in one statement, once', async () => {
    const user = await makeUser('sla');
    const projectId = await makeProject(user, 'SLB');
    const created = await issues.createIssue({ userId: user }, projectId, { title: 'Overdue' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const now = new Date();
    await db
      .update(tickets)
      .set({ slaDueAt: new Date(now.getTime() - 60_000) })
      .where(eq(tickets.id, created.issue.id));

    await runSlaJob(now);
    await runSlaJob(new Date(now.getTime() + 1000));
    const breached = await eventsOf(created.issue.id, 'issue.sla_breached');
    expect(breached.length).toBe(1);
    expect(breached[0]).toMatchObject({
      projectId,
      webhookPendingProjectId: projectId,
      data: { key: created.issue.key, title: 'Overdue', summary: 'breached its SLA' },
    });
    const [ticket] = await db.select({ at: tickets.slaBreachedAt }).from(tickets).where(eq(tickets.id, created.issue.id));
    expect(ticket.at?.getTime()).toBe(breached[0].createdAt.getTime());
  });

  it('applying the SLA policy writes its project.sla_policy_applied line, with the count, in the same statement', async () => {
    const user = await makeUser('slp');
    const projectId = await makeProject(user, 'SLP');
    const made = await Promise.all(
      ['high', 'high', 'low'].map((priority) =>
        issues.createIssue({ userId: user }, projectId, { title: `P ${priority}`, priority: priority as 'high' | 'low' }),
      ),
    );
    expect(made.every((m) => m.ok)).toBe(true);
    await db.update(projects).set({ slaPolicy: { high: 4 } }).where(eq(projects.id, projectId));

    const count = await applyPolicyToOpenIssues(projectId, user);
    expect(count).toBe(2);
    const rows = await db
      .select()
      .from(activities)
      .where(and(eq(activities.projectId, projectId), eq(activities.type, 'project.sla_policy_applied')));
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      actorId: user,
      ticketId: null,
      webhookPendingProjectId: null,
      data: { count: 2, summary: 'applied the SLA policy to 2 open issues' },
    });
    const due = await db
      .select({ slaDueAt: tickets.slaDueAt })
      .from(tickets)
      .where(inArray(tickets.id, made.flatMap((m) => (m.ok ? [m.issue.id] : []))));
    expect(due.filter((d) => d.slaDueAt).length).toBe(2);
  });
});

async function doneState(projectId: string) {
  const [state] = await db
    .select({ id: workflowStates.id })
    .from(workflowStates)
    .where(and(eq(workflowStates.projectId, projectId), eq(workflowStates.type, 'completed')));
  return state.id;
}
