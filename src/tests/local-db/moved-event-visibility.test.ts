import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray, like, sql } from 'drizzle-orm';

// No after-response fan-out: webhook delivery and the readers are called directly.
vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: () => undefined,
}));
vi.mock('@/lib/events', async (orig) => ({
  ...(await orig<typeof import('@/lib/events')>()),
  publishIssueEvents: () => undefined,
}));

import { db } from '@/lib/db';
import { activities, labels, projectMembers, projects, webhookDeliveries, webhooks, workflowStates } from '@/db/schema';
import * as issues from '@/lib/issue-service';
import { loadIssueTimeline } from '@/lib/comments';
import { resolveAuditScope } from '@/lib/audit';
import { recordedIn } from '@/lib/moved-events';
import { loadAuditLogView } from '@/lib/components/audit/audit-log-view.server';
import { deliverWebhooks } from '@/lib/integrations/outgoing-webhooks';
import { postToSlack } from '@/lib/integrations/slack';
import { SLACK_URL_PREFIX } from '@/lib/integrations/event-types';
import type { StoredIssueEvent } from '@/lib/events';
import { GET as exportAudit } from '../../routes/api/audit/+server';
import { localDb, makeProject, makeUser } from './fixtures';

let server: Server;
let url = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume();
    req.on('end', () => res.writeHead(204).end());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function auditExport(viewerId: string, projectId: string, extra = ''): Promise<string> {
  const event = {
    url: new URL(`http://localhost/api/audit?scope=project&id=${projectId}&format=json${extra}`),
    locals: { user: { id: viewerId } },
  } as unknown as Parameters<typeof exportAudit>[0];
  const res = await exportAudit(event);
  expect(res.status).toBe(200);
  return res.text();
}

describe.skipIf(!localDb)('issue.moved does not reveal the other project (gap D item 1)', () => {
  it('readers of the source learn the destination only as members of it; integrations never', async () => {
    const owner = await makeUser('mv-owner');
    const sourceOnly = await makeUser('mv-source-only');
    const both = await makeUser('mv-both');
    const a = await makeProject(owner, 'MVA', [sourceOnly, both]);
    const b = await makeProject(owner, 'MVB', [both]);
    // The audit log is for admins of the project.
    await db
      .update(projectMembers)
      .set({ role: 'admin' })
      .where(and(eq(projectMembers.projectId, a), inArray(projectMembers.userId, [sourceOnly, both])));
    const [bRow] = await db.select({ key: projects.ticketKey }).from(projects).where(eq(projects.id, b));
    const hidden = (text: string) => {
      expect(text).not.toContain(b);
      expect(text).not.toContain(bRow.key);
    };

    await db.insert(webhooks).values(
      [a, b].map((projectId) => ({
        id: crypto.randomUUID(),
        projectId,
        url,
        secret: 'shh',
        events: [],
        createdAt: new Date(),
      })),
    );
    await db
      .update(projects)
      .set({ slackWebhookUrl: `${SLACK_URL_PREFIX}services/T0/B0/x`, slackEvents: null })
      .where(eq(projects.id, a));

    const created = await issues.createIssue({ userId: owner }, a, { title: 'Travels' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const out = await issues.moveIssue({ userId: owner }, a, created.issue.id, b);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Back again: the issue's history now in A carries both moves' target-side rows.
    const back = await issues.moveIssue({ userId: both }, b, created.issue.id, a);
    expect(back.ok).toBe(true);
    if (!back.ok) return;

    // The stored rows keep the destination (nothing is rewritten).
    const stored = await db.select().from(activities).where(eq(activities.type, 'issue.moved'));
    const mine = stored.filter((row) => JSON.stringify(row.data).includes(created.issue.id) || row.ticketId === created.issue.id);
    expect(JSON.stringify(mine)).toContain(bRow.key);

    // Timeline: a member of A only sees "another project"; a member of both sees B.
    const forSourceOnly = await loadIssueTimeline(a, created.issue.id, sourceOnly);
    const movedLines = forSourceOnly.activities.filter((row) => row.type === 'issue.moved');
    // The first move's target-side row was recorded in B: collapsed.
    expect(movedLines.length).toBe(1);
    expect(forSourceOnly.activities.some((row) => row.type === 'issue.activity_elsewhere')).toBe(true);
    hidden(JSON.stringify(forSourceOnly.activities));
    expect(movedLines.map((row) => row.data.summary)).toContain('moved from another project');
    const forBoth = await loadIssueTimeline(a, created.issue.id, both);
    expect(JSON.stringify(forBoth.activities)).toContain(bRow.key);

    // Audit export (the REST API over the audit log): same rule.
    const exportedForSourceOnly = await auditExport(sourceOnly, a);
    expect(exportedForSourceOnly).toContain('to another project');
    hidden(exportedForSourceOnly);
    expect(await auditExport(both, a)).toContain(bRow.key);

    // Webhooks: A's receiver gets nothing naming B (the source-side row is not
    // delivered; the history rows are A's own); B's receiver never gets A.
    // Delivered directly, only this test's own pending events: a global sweep
    // "in the future" would also deliver other suites' fresh events early.
    const pendingHere = () =>
      db
        .select({
          id: activities.id,
          projectId: activities.webhookPendingProjectId,
          ticketId: activities.ticketId,
          actorId: activities.actorId,
          type: activities.type,
          data: activities.data,
          createdAt: activities.createdAt,
        })
        .from(activities)
        .where(inArray(activities.webhookPendingProjectId, [a, b]));
    await deliverWebhooks((await pendingHere()).map((row) => ({ ...row, data: row.data ?? {} }) as StoredIssueEvent));
    expect(await pendingHere()).toEqual([]);
    const hooks = await db.select().from(webhooks).where(inArray(webhooks.projectId, [a, b]));
    const hookOf = (projectId: string) => hooks.find((h) => h.projectId === projectId)!.id;
    const deliveries = await db.select().from(webhookDeliveries).where(inArray(webhookDeliveries.webhookId, [hookOf(a), hookOf(b)]));
    const toA = deliveries.filter((d) => d.webhookId === hookOf(a));
    const toB = deliveries.filter((d) => d.webhookId === hookOf(b));
    expect(toA.some((d) => d.eventType === 'issue.moved')).toBe(true);
    expect(toB.some((d) => d.eventType === 'issue.moved')).toBe(true);
    hidden(JSON.stringify(toA.map((d) => d.payload)));
    const [aRow] = await db.select({ key: projects.ticketKey }).from(projects).where(eq(projects.id, a));
    const bPayloads = JSON.stringify(toB.map((d) => d.payload));
    expect(bPayloads).not.toContain(a);
    expect(bPayloads).not.toContain(`"${aRow.key}-`);

    // Slack for A: every move row of A, posted or not, names nothing of B.
    const aRows = (await db.select().from(activities).where(and(eq(activities.projectId, a), eq(activities.type, 'issue.moved')))).map(
      (row) => ({ ...row, data: row.data ?? {} }) as StoredIssueEvent,
    );
    expect(aRows.length).toBeGreaterThan(0);
    const posts: string[] = [];
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (!String(input instanceof Request ? input.url : input).startsWith(SLACK_URL_PREFIX)) return realFetch(input, init);
      posts.push(String(init?.body));
      return new Response(null, { status: 200 });
    });
    try {
      await postToSlack(aRows);
    } finally {
      fetchSpy.mockRestore();
    }
    hidden(posts.join('\n'));
  });

  it('history recorded in a project the viewer is not a member of is collapsed, both ways', async () => {
    const owner = await makeUser('mv2-owner');
    const aOnly = await makeUser('mv2-a-only');
    const bOnly = await makeUser('mv2-b-only');
    const both = await makeUser('mv2-both');
    const a = await makeProject(owner, 'HVA', [aOnly, both]);
    const b = await makeProject(owner, 'HVB', [bOnly, both]);
    // Audit readers are admins; aOnly is not a member of B (an admin of A only).
    await db
      .update(projectMembers)
      .set({ role: 'admin' })
      .where(inArray(projectMembers.userId, [aOnly, bOnly, both]));
    const [aRow] = await db.select({ key: projects.ticketKey }).from(projects).where(eq(projects.id, a));
    const [bRow] = await db.select({ key: projects.ticketKey }).from(projects).where(eq(projects.id, b));
    const secretState = 'Quarantine-' + crypto.randomUUID().slice(0, 8);
    const secretLabel = 'embargoed-' + crypto.randomUUID().slice(0, 8);
    const secretTitle = 'Codename-' + crypto.randomUUID().slice(0, 8);
    const [state] = await db
      .insert(workflowStates)
      .values({ id: crypto.randomUUID(), projectId: b, name: secretState, type: 'started', color: '#888888', position: 9, createdAt: new Date() })
      .returning({ id: workflowStates.id });
    const [label] = await db
      .insert(labels)
      .values({ id: crypto.randomUUID(), projectId: b, name: secretLabel, color: '#888888', createdAt: new Date() })
      .returning({ id: labels.id });

    const timelineText = async (projectId: string, issueId: string, viewer: string) =>
      JSON.stringify((await loadIssueTimeline(projectId, issueId, viewer)).activities);
    const auditListText = async (projectId: string, viewer: string) => {
      const scope = await resolveAuditScope('project', projectId, viewer);
      expect(scope).not.toBeNull();
      return JSON.stringify((await loadAuditLogView(scope!, {}, '/audit')).rows);
    };

    // (i) A → B, edited in B (title, state, label), → A.
    const created = await issues.createIssue({ userId: owner }, a, { title: 'Open title' });
    if (!created.ok) throw new Error(created.error);
    const id = created.issue.id;
    expect((await issues.moveIssue({ userId: owner }, a, id, b)).ok).toBe(true);
    const edited = await issues.updateIssueFields({ userId: both }, b, id, {
      title: secretTitle,
      stateId: state.id,
      addLabelIds: [label.id],
    });
    expect(edited.ok).toBe(true);
    // The title it carries back is its current one; the secret one was only B's.
    expect((await issues.updateIssueFields({ userId: both }, b, id, { title: 'Final title' })).ok).toBe(true);
    expect((await issues.moveIssue({ userId: both }, b, id, a)).ok).toBe(true);

    const leaks = (text: string) =>
      [bRow.key, b, secretTitle, secretState, secretLabel].filter((needle) => text.includes(needle));
    const aOnlyTimeline = await timelineText(a, id, aOnly);
    expect(leaks(aOnlyTimeline)).toEqual([]);
    expect(aOnlyTimeline).toContain('activity in another project');
    expect(aOnlyTimeline).toContain('Open title'); // what happened in A stays
    expect(leaks(await auditListText(a, aOnly))).toEqual([]);
    expect(leaks(await auditExport(aOnly, a))).toEqual([]);

    // Filters select rows by what they say: a row collapsed for this viewer
    // must not match one at all (it would tell who did what kind of thing in
    // B, or that the issue was HVB-n there).
    const [old] = await db
      .select({ key: sql<string>`${activities.data} ->> 'key'` })
      .from(activities)
      .where(and(eq(activities.ticketId, id), like(sql`${activities.data} ->> 'key'`, `${bRow.key}-%`)))
      .limit(1);
    expect(old?.key).toBeTruthy();
    const filteredRows = async (viewer: string, query: Record<string, string>) => {
      const scope = await resolveAuditScope('project', a, viewer);
      return (await loadAuditLogView(scope!, query, '/audit')).rows;
    };
    expect(await filteredRows(aOnly, { issue: old.key })).toEqual([]);
    for (const query of [{ actor: both }, { category: 'issues' }] as Record<string, string>[]) {
      const rows = await filteredRows(aOnly, query);
      expect(rows.length).toBeGreaterThan(0); // what happened in A still matches
      expect(rows.filter((row) => row.type === 'issue.activity_elsewhere')).toEqual([]);
      expect(leaks(JSON.stringify(rows))).toEqual([]);
    }
    expect(await auditExport(aOnly, a, `&issue=${old.key}`)).toContain('"count":0');
    expect((await filteredRows(both, { issue: old.key })).length).toBeGreaterThan(0);
    // A member of both sees everything.
    const bothTimeline = await timelineText(a, id, both);
    expect(leaks(bothTimeline)).toEqual([bRow.key, b, secretTitle, secretState, secretLabel]);
    expect(bothTimeline).not.toContain('activity in another project');
    expect(leaks(await auditExport(both, a)).length).toBeGreaterThan(0);

    // (ii) A single move A → B, read from B by a member of B only.
    const second = await issues.createIssue({ userId: owner }, a, { title: 'Second' });
    if (!second.ok) throw new Error(second.error);
    expect((await issues.updateIssueFields({ userId: owner }, a, second.issue.id, { title: 'Retitled in A' })).ok).toBe(true);
    expect((await issues.updateIssueFields({ userId: owner }, a, second.issue.id, { title: 'Carried title' })).ok).toBe(true);
    expect((await issues.moveIssue({ userId: owner }, a, second.issue.id, b)).ok).toBe(true);
    const fromA = (text: string) => [`${aRow.key}-`, a, 'Retitled in A'].filter((needle) => text.includes(needle));
    const bOnlyTimeline = await timelineText(b, second.issue.id, bOnly);
    expect(fromA(bOnlyTimeline)).toEqual([]);
    expect(bOnlyTimeline).toContain('moved from another project');
    expect(fromA(await auditListText(b, bOnly))).toEqual([]);
    expect(fromA(await auditExport(bOnly, b))).toEqual([]);
    expect(fromA(await timelineText(b, second.issue.id, both)).length).toBeGreaterThan(0);

    // A row stamped at the exact instant of a move may belong to either side:
    // it needs both (fail closed).
    const at = new Date('2026-11-12T12:00:00Z');
    const move = { id: 'm1', at: at.getTime(), from: 'P', to: 'Q' };
    expect(recordedIn({ id: 'r', createdAt: at, ticketId: 't', projectId: 'Q' }, [move]).sort()).toEqual(['P', 'Q']);
  });
});
