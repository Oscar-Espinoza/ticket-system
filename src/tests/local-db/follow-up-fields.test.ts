// Waiting-on / follow-up issue fields: membership validation (tenant
// isolation), the daily follow-up job, search tokens, and one REST + one
// GraphQL round trip.
import { describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

// The GraphQL route loads the auth module, whose OAuth plugin needs a base URL.
vi.hoisted(() => {
  process.env.BETTER_AUTH_URL ||= 'http://localhost:3014';
});

vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: () => undefined,
}));

import { db } from '@/lib/db';
import { activities, apiKeys, notifications, projectMembers, tickets, workflowStates } from '@/db/schema';
import { generateApiKey } from '@/lib/api-auth';
import { run as runFollowUps } from '@/lib/cron/jobs/follow-ups';
import { addDays, toDateString } from '@/lib/dates';
import * as issues from '@/lib/issue-service';
import { searchIssues } from '@/lib/search';
import { GET as getIssue } from '../../routes/api/v1/issues/[key]/+server';
import { GET as listIssues, POST as postIssue } from '../../routes/api/v1/projects/[id]/issues/+server';
import { POST as graphql } from '../../routes/api/graphql/+server';
import { localDb, makeProject, makeUser } from './fixtures';

// A fixed "now"; "today" is its calendar date in the server's timezone, as in the job.
const NOW = new Date(2026, 10, 12, 9, 0, 0);
const day = (offset: number) => toDateString(addDays(NOW, offset));

async function followUpNotifications(ticketId: string) {
  return db
    .select({ userId: notifications.userId, data: notifications.data })
    .from(notifications)
    .where(and(eq(notifications.ticketId, ticketId), eq(notifications.type, 'follow_up')));
}

async function apiKeyFor(userId: string) {
  const { key, prefix, hash } = generateApiKey();
  await db.insert(apiKeys).values({ id: crypto.randomUUID(), userId, name: 't', prefix, keyHash: hash, createdAt: new Date() });
  return key;
}

const call = async (
  handler: (event: never) => Response | Promise<Response>,
  request: Request,
  params: Record<string, string>,
) => handler({ request, params } as never);

describe.skipIf(!localDb)('waiting on: project members only', () => {
  it('rejects a user outside the project on create and update, accepts a member', async () => {
    const owner = await makeUser('wo-owner');
    const member = await makeUser('wo-member');
    const outsider = await makeUser('wo-outsider');
    const project = await makeProject(owner, 'WO', [member]);
    await makeProject(outsider, 'WOX'); // a member of another project only

    const refused = await issues.createIssue({ userId: owner }, project, { title: 'A', waitingOnId: outsider });
    expect(refused).toEqual({ ok: false, error: 'Waiting on must be a project member.', field: 'waitingOnId' });

    const created = await issues.createIssue({ userId: owner }, project, { title: 'A', waitingOnId: member });
    expect(created.ok && created.issue.waitingOn?.id).toBe(member);
    if (!created.ok) return;

    const update = await issues.updateIssueFields({ userId: owner }, project, created.issue.id, { waitingOnId: outsider });
    expect(update.ok).toBe(false);
    const [row] = await db.select({ waitingOnId: tickets.waitingOnId }).from(tickets).where(eq(tickets.id, created.issue.id));
    expect(row.waitingOnId).toBe(member);

    // Clearing writes the timeline entry like the assignee does.
    const cleared = await issues.updateIssueFields({ userId: owner }, project, created.issue.id, {
      waitingOnId: null,
      followUp: '2026-12-01',
    });
    expect(cleared.ok && [cleared.issue.waitingOn, cleared.issue.followUp]).toEqual([null, '2026-12-01']);
    const [activity] = await db
      .select({ data: activities.data })
      .from(activities)
      .where(and(eq(activities.ticketId, created.issue.id), eq(activities.type, 'issue.updated')));
    expect((activity.data as { changes: unknown[] }).changes).toEqual([
      { field: 'waitingOnId', from: { id: member, name: 'wo-member' }, to: null },
      { field: 'followUp', from: null, to: '2026-12-01' },
    ]);
  });

  it('moving the issue keeps waiting-on only when that person is a member of the target', async () => {
    const owner = await makeUser('wm-owner');
    const both = await makeUser('wm-both');
    const sourceOnly = await makeUser('wm-source');
    const from = await makeProject(owner, 'WMA', [both, sourceOnly]);
    const to = await makeProject(owner, 'WMB', [both]);
    const kept = await issues.createIssue({ userId: owner }, from, { title: 'kept', waitingOnId: both });
    const dropped = await issues.createIssue({ userId: owner }, from, { title: 'dropped', waitingOnId: sourceOnly });
    if (!kept.ok || !dropped.ok) throw new Error('setup');

    const a = await issues.moveIssue({ userId: owner }, from, kept.issue.id, to);
    const b = await issues.moveIssue({ userId: owner }, from, dropped.issue.id, to);
    expect(a.ok && a.issue.waitingOn?.id).toBe(both);
    expect(b.ok && b.issue.waitingOn).toBe(null);
  });
});

describe.skipIf(!localDb)('daily follow-up job', () => {
  it('notifies the assignee once per follow-up date, catches up, re-arms, skips closed and unassigned', async () => {
    const owner = await makeUser('fu-owner');
    const assignee = await makeUser('fu-assignee');
    const waited = await makeUser('fu-waited');
    const project = await makeProject(owner, 'FU', [assignee, waited]);
    const [done] = await db
      .select({ id: workflowStates.id })
      .from(workflowStates)
      .where(and(eq(workflowStates.projectId, project), eq(workflowStates.type, 'completed')));
    const make = async (title: string, input: Partial<issues.CreateIssueInput>) => {
      const result = await issues.createIssue({ userId: owner }, project, { title, assigneeId: assignee, ...input });
      if (!result.ok) throw new Error(result.error);
      return result.issue.id;
    };

    const dueToday = await make('today', { followUp: day(0), waitingOnId: waited });
    const missed = await make('missed while down', { followUp: day(-3) });
    const future = await make('tomorrow', { followUp: day(1) });
    const closed = await make('closed', { followUp: day(0), stateId: done.id });
    const unassigned = await make('unassigned', { followUp: day(0), assigneeId: null });
    const archived = await make('archived', { followUp: day(0) });
    await issues.archive({ userId: owner }, project, archived);

    await runFollowUps(NOW);
    const first = await followUpNotifications(dueToday);
    expect(first).toEqual([
      { userId: assignee, data: expect.objectContaining({ summary: 'follow-up date reached — waiting on fu-waited' }) },
    ]);
    expect(await followUpNotifications(missed)).toHaveLength(1);
    for (const id of [future, closed, unassigned, archived]) expect(await followUpNotifications(id)).toEqual([]);

    // Rerun the same day (or a retry): nothing new.
    await runFollowUps(NOW);
    expect(await followUpNotifications(dueToday)).toHaveLength(1);
    expect(await followUpNotifications(missed)).toHaveLength(1);

    // A new date re-arms it; it fires once that day arrives, and the field stays.
    await issues.updateIssueFields({ userId: owner }, project, dueToday, { followUp: day(2) });
    await runFollowUps(NOW);
    expect(await followUpNotifications(dueToday)).toHaveLength(1);
    await runFollowUps(addDays(NOW, 2));
    expect(await followUpNotifications(dueToday)).toHaveLength(2);
    const [row] = await db.select({ followUp: tickets.followUp }).from(tickets).where(eq(tickets.id, dueToday));
    expect(row.followUp).toBe(day(2));
  });
});

describe.skipIf(!localDb)('daily follow-up job: assignee who left the project', () => {
  it('stays unclaimed until a current member is assigned, then notifies that person', async () => {
    const owner = await makeUser('fl-owner');
    const ana = await makeUser('fl-ana');
    const bob = await makeUser('fl-bob');
    const project = await makeProject(owner, 'FL', [ana, bob]);
    const created = await issues.createIssue({ userId: owner }, project, { title: 'left', assigneeId: ana, followUp: day(0) });
    if (!created.ok) throw new Error(created.error);
    const id = created.issue.id;

    // Removing a member does not unassign their issues.
    await db.delete(projectMembers).where(and(eq(projectMembers.projectId, project), eq(projectMembers.userId, ana)));
    await runFollowUps(NOW);
    expect(await followUpNotifications(id)).toEqual([]);
    const [unclaimed] = await db.select({ notified: tickets.followUpNotifiedOn }).from(tickets).where(eq(tickets.id, id));
    expect(unclaimed.notified).toBeNull();

    await issues.updateIssueFields({ userId: owner }, project, id, { assigneeId: bob });
    await runFollowUps(NOW);
    expect((await followUpNotifications(id)).map((n) => n.userId)).toEqual([bob]);

    // Re-arm rule as built: the date is notified once, and reassigning after does not repeat it.
    await issues.updateIssueFields({ userId: owner }, project, id, { assigneeId: owner });
    await runFollowUps(NOW);
    expect(await followUpNotifications(id)).toHaveLength(1);
  });
});

describe.skipIf(!localDb)('search tokens', () => {
  it('waiting:me and followup:overdue / date bounds', async () => {
    const me = await makeUser('st-me');
    const other = await makeUser('st-other');
    const project = await makeProject(me, 'ST', [other]);
    const today = toDateString(new Date());
    const yesterday = toDateString(addDays(new Date(), -1));
    const create = async (title: string, input: Partial<issues.CreateIssueInput>) => {
      const result = await issues.createIssue({ userId: me }, project, { title, ...input });
      if (!result.ok) throw new Error(result.error);
      return result.issue.key;
    };
    const mine = await create('mine overdue', { waitingOnId: me, followUp: yesterday });
    const theirs = await create('theirs today', { waitingOnId: other, followUp: today });
    const none = await create('nobody', {});

    const keys = async (query: string) =>
      (await searchIssues(me, query, { projectId: project })).map((r) => r.issue.key).sort();
    expect(await keys('waiting:me')).toEqual([mine]);
    expect(await keys('waiting:none')).toEqual([none]);
    expect(await keys('followup:overdue')).toEqual([mine]);
    expect(await keys(`followup:>=${today}`)).toEqual([theirs]);
    expect(await keys('-waiting:me followup:none')).toEqual([none]);
  });
});

describe.skipIf(!localDb)('API round trips', () => {
  it('REST: create with the fields, read them back, filter by them', async () => {
    const user = await makeUser('rest-user');
    const other = await makeUser('rest-other');
    const project = await makeProject(user, 'RS', [other]);
    const key = await apiKeyFor(user);
    const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
    const base = 'http://localhost/api/v1';

    const created = await call(
      postIssue,
      new Request(`${base}/projects/${project}/issues`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: 'REST', waitingOnId: other, followUp: '2026-12-01' }),
      }),
      { id: project },
    );
    expect(created.status).toBe(201);
    const { issue } = await created.json();

    const read = await (await call(getIssue, new Request(`${base}/issues/${issue.key}`, { headers }), { key: issue.key })).json();
    expect(read.issue).toMatchObject({ waitingOn: { id: other, name: 'rest-other' }, followUp: '2026-12-01' });

    const listed = await call(
      listIssues,
      new Request(`${base}/projects/${project}/issues?waiting_on=${other}&follow_up=<=2026-12-01`, { headers }),
      { id: project },
    );
    expect((await listed.json()).issues.map((i: { key: string }) => i.key)).toEqual([issue.key]);
    const bad = await call(listIssues, new Request(`${base}/projects/${project}/issues?follow_up=soon`, { headers }), { id: project });
    expect(bad.status).toBe(400);
  });

  it('GraphQL: update the fields, read them back, filter by them', async () => {
    const user = await makeUser('gql-user');
    const project = await makeProject(user, 'GQ');
    const created = await issues.createIssue({ userId: user }, project, { title: 'GQL' });
    if (!created.ok) throw new Error('setup');
    const key = await apiKeyFor(user);
    const gql = async (query: string) => {
      const response = await call(
        graphql,
        new Request('http://localhost/api/graphql', {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify({ query }),
        }),
        {},
      );
      return response.json();
    };

    const updated = await gql(
      `mutation { updateIssue(key: "${created.issue.key}", input: { waitingOnId: "${user}", followUp: "2026-12-01" }) { waitingOn { id } followUp } }`,
    );
    expect(updated).toEqual({ data: { updateIssue: { waitingOn: { id: user }, followUp: '2026-12-01' } } });

    const listed = await gql(
      `{ issues(projectId: "${project}", filter: { waitingOn: "me", followUp: "2026-12-01" }) { nodes { key } } }`,
    );
    expect(listed.data.issues.nodes).toEqual([{ key: created.issue.key }]);

    const outsider = await makeUser('gql-outsider');
    const refused = await gql(`mutation { updateIssue(key: "${created.issue.key}", input: { waitingOnId: "${outsider}" }) { key } }`);
    // (Under vitest yoga masks the service's GraphQLError as INTERNAL_SERVER_ERROR,
    // for assignee errors too; the stored value is what matters here.)
    expect(refused.data).toBeNull();
    const [row] = await db.select({ waitingOnId: tickets.waitingOnId }).from(tickets).where(eq(tickets.id, created.issue.id));
    expect(row.waitingOnId).toBe(user);
  });
});
