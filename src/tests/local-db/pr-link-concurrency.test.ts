import { describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

// No after-response fan-out: only the committed rows matter here.
vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: () => undefined,
}));

import { db } from '@/lib/db';
import { activities, githubPullRequests, projects } from '@/db/schema';
import * as issues from '@/lib/issue-service';
import { syncPullRequest, type VcsPullRequest } from '@/lib/vcs/automation';
import { localDb, makeProject, makeUser } from './fixtures';

async function setup(label: string, count: number) {
  const user = await makeUser(label);
  const projectId = await makeProject(user, label.toUpperCase());
  const [row] = await db
    .select({ id: projects.id, ticketKey: projects.ticketKey })
    .from(projects)
    .where(eq(projects.id, projectId));
  const created = [];
  for (let i = 0; i < count; i++) {
    const result = await issues.createIssue({ userId: user }, projectId, { title: `Issue ${i}` });
    if (!result.ok) throw new Error(result.error);
    created.push(result.issue);
  }
  return { project: { ...row, prOpenStateId: null, prMergeStateId: null }, issues: created };
}

const pullRequest = (key: string, number: number, extra: Partial<VcsPullRequest> = {}): VcsPullRequest => ({
  provider: 'github',
  repo: 'acme/app',
  number,
  title: `Fix ${key}`,
  body: null,
  url: `https://github.com/acme/app/pull/${number}`,
  state: 'open',
  draft: false,
  branch: null,
  author: 'octocat',
  mergedAt: null,
  ...extra,
});

const countEvents = async (ticketIds: string[], type: string) => {
  const rows = await db
    .select({ ticketId: activities.ticketId })
    .from(activities)
    .where(and(inArray(activities.ticketId, ticketIds), eq(activities.type, type)));
  return ticketIds.map((id) => rows.filter((r) => r.ticketId === id).length);
};

describe.skipIf(!localDb)('PR links are idempotent under concurrency (gap D item 2)', () => {
  it('two deliveries at once for the same PR write one link and one github.pr_linked', async () => {
    const { project, issues: list } = await setup('prc', 6);
    // Several PRs, each delivered twice at the same moment.
    await Promise.all(
      list.flatMap((issue, i) => {
        const pr = pullRequest(issue.key, 100 + i);
        return [syncPullRequest(project, pr, 'opened'), syncPullRequest(project, pr, 'updated')];
      }),
    );
    const ids = list.map((issue) => issue.id);
    expect(await countEvents(ids, 'github.pr_linked')).toEqual(ids.map(() => 1));
    const links = await db.select({ ticketId: githubPullRequests.ticketId }).from(githubPullRequests).where(inArray(githubPullRequests.ticketId, ids));
    expect(links.length).toBe(ids.length);
  });

  it('two merge deliveries at once write one github.pr_merged', async () => {
    const { project, issues: list } = await setup('prm', 6);
    await Promise.all(list.map((issue, i) => syncPullRequest(project, pullRequest(issue.key, 200 + i), 'opened')));
    await Promise.all(
      list.flatMap((issue, i) => {
        const merged = pullRequest(issue.key, 200 + i, { state: 'merged', mergedAt: new Date() });
        return [syncPullRequest(project, merged, 'closed'), syncPullRequest(project, merged, 'updated')];
      }),
    );
    const ids = list.map((issue) => issue.id);
    expect(await countEvents(ids, 'github.pr_merged')).toEqual(ids.map(() => 1));
  });

  it('a delivery whose repo differs only in letter case updates the existing link', async () => {
    const { project, issues: list } = await setup('prk', 1);
    const [issue] = list;
    await syncPullRequest(project, pullRequest(issue.key, 300, { repo: 'Acme/App' }), 'opened');
    await syncPullRequest(project, pullRequest(issue.key, 300, { repo: 'acme/app', title: `Fix ${issue.key} (renamed)` }), 'updated');
    const links = await db.select().from(githubPullRequests).where(eq(githubPullRequests.ticketId, issue.id));
    expect(links.length).toBe(1);
    expect(links[0].title).toBe(`Fix ${issue.key} (renamed)`);
    expect(await countEvents([issue.id], 'github.pr_linked')).toEqual([1]);
  });
});
