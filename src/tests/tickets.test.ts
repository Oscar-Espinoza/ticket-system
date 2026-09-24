// Integration tests for GSD Phase 5 — Tickets Core (TKT-01…06).
// Same harness as projects.test.ts: real Neon DB, mocked session/headers/cache.

import { vi } from 'vitest';

const session = vi.hoisted(() => ({ userId: '' }));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () =>
        session.userId ? { user: { id: session.userId } } : null,
      ),
    },
  },
}));

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, projects, tickets, users, workflowStates } from '@/db/schema';
import {
  createTicket,
  deleteTicket,
  restoreIssue,
  updateIssue,
} from '@/app/actions/tickets';
import { getProjectIssues } from '@/lib/tickets';
import { getProjectData } from '@/lib/project-data';
import { UNASSIGNED, filterIssues } from '@/lib/issue-model';
import { getMemberProject } from '@/lib/project-access';
import { workflowStateInserts } from '@/lib/workflow-server';

const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const userIds: string[] = [];
const projectIds: string[] = [];

async function insertUser(tag: string): Promise<string> {
  const id = `test-tkt-${tag}-${RUN}`;
  const now = new Date();
  await db.insert(users).values({
    id,
    name: `Ticket Test ${tag}`,
    email: `${id}@example.test`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  userIds.push(id);
  return id;
}

function uniqueKey(): string {
  const letters = Math.random()
    .toString(36)
    .replace(/[^a-z]/g, '')
    .toUpperCase()
    .padEnd(4, 'Q');
  return `T${letters.slice(0, 5)}`;
}

type TestProject = { id: string; ticketKey: string; states: Record<string, string> };

async function insertProject(ownerId: string, memberIds: string[] = []): Promise<TestProject> {
  const id = `test-tkt-proj-${RUN}-${projectIds.length}`;
  const ticketKey = uniqueKey();
  const now = new Date();
  await db.insert(projects).values({
    id,
    name: `Ticket project ${projectIds.length}`,
    ticketKey,
    ticketCounter: 0,
    ownerId,
    createdAt: now,
    updatedAt: now,
  });
  projectIds.push(id);
  const stateRows = workflowStateInserts(id, now);
  await db.insert(workflowStates).values(stateRows);
  await db.insert(projectMembers).values(
    [
      { userId: ownerId, role: 'owner' as const },
      ...memberIds.map((userId) => ({ userId, role: 'member' as const })),
    ].map((m) => ({
      id: `${id}-${m.userId}`,
      projectId: id,
      userId: m.userId,
      role: m.role,
      createdAt: now,
    })),
  );
  return {
    id,
    ticketKey,
    states: Object.fromEntries(stateRows.map((s) => [s.name, s.id!])),
  };
}

let owner: string;
let member: string;
let outsider: string;
let project: TestProject;
let otherProject: TestProject;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — create .env.local first.');
  }
  owner = await insertUser('owner');
  member = await insertUser('member');
  outsider = await insertUser('outsider');
  project = await insertProject(owner, [member]);
  otherProject = await insertProject(outsider);
});

afterAll(async () => {
  if (projectIds.length) {
    await db.delete(projects).where(inArray(projects.id, projectIds));
  }
  if (userIds.length) {
    await db.delete(users).where(inArray(users.id, userIds));
  }
});

beforeEach(async () => {
  session.userId = owner;
});

async function issuesOf(projectId: string) {
  return getProjectIssues(projectId, owner);
}

async function create(title = 'An issue', projectId = project.id) {
  const result = await createTicket({ projectId, title });
  if (!result.ok || !result.ticket) {
    throw new Error(`createTicket failed: ${JSON.stringify(result)}`);
  }
  return result.ticket;
}

describe('TKT-01/02: create with per-project identifiers', () => {
  it('creates a ticket with sequential keys and defaults', async () => {
    const a = await create('First');
    const b = await create('Second');
    expect(b.number).toBe(a.number + 1);
    expect(a.key).toBe(`${project.ticketKey}-${a.number}`);
    expect(a.state.name).toBe('Backlog');
    expect(a.priority).toBe('none');
    expect(a.assignee).toBeNull();
    expect(a.creator?.id).toBe(owner);
    expect(a.title).toBe('First');
    expect(Math.abs(new Date(a.createdAt).getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('assigns unique numbers under concurrent creation', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createTicket({ projectId: project.id, title: `Concurrent ${i}` }),
      ),
    );
    const numbers = results.map((r) => (r.ok ? r.ticket!.number : -1));
    expect(numbers).not.toContain(-1);
    expect(new Set(numbers).size).toBe(10);
  });

  it('accepts an initial state and trims the title', async () => {
    const result = await createTicket({
      projectId: project.id,
      title: '  Board card  ',
      stateId: project.states['In Review'],
    });
    expect(result.ok && result.ticket?.state.name).toBe('In Review');
    expect(result.ok && result.ticket?.startedAt).toBeTruthy();
    expect(result.ok && result.ticket?.title).toBe('Board card');
  });

  it('rejects empty and oversized titles and foreign states', async () => {
    expect(await createTicket({ projectId: project.id, title: '   ' })).toMatchObject({
      ok: false,
      field: 'title',
    });
    expect(
      await createTicket({ projectId: project.id, title: 'x'.repeat(201) }),
    ).toMatchObject({ ok: false, field: 'title' });
    expect(
      await createTicket({
        projectId: project.id,
        title: 'Foreign state',
        stateId: otherProject.states.Todo,
      }),
    ).toMatchObject({ ok: false, field: 'stateId' });
  });
});

describe('TKT-03/04: edit, trash and restore', () => {
  it('updates title and description', async () => {
    const t = await create();
    expect(
      await updateIssue({
        projectId: project.id,
        id: t.id,
        patch: { title: 'Renamed', description: 'Details' },
      }),
    ).toMatchObject({ ok: true });
    const [row] = await db.select().from(tickets).where(eq(tickets.id, t.id));
    expect(row.title).toBe('Renamed');
    expect(row.description).toBe('Details');
  });

  it('moves a ticket to the trash and restores it', async () => {
    const t = await create();
    expect(await deleteTicket({ projectId: project.id, id: t.id })).toMatchObject({ ok: true });
    const [trashed] = await db.select().from(tickets).where(eq(tickets.id, t.id));
    expect(trashed.deletedAt).not.toBeNull();
    expect((await issuesOf(project.id)).map((i) => i.id)).not.toContain(t.id);

    expect(await restoreIssue({ projectId: project.id, id: t.id })).toMatchObject({ ok: true });
    expect((await issuesOf(project.id)).map((i) => i.id)).toContain(t.id);
  });

  it('never touches a ticket through another project id', async () => {
    session.userId = outsider;
    const foreign = await create('Foreign', otherProject.id);
    session.userId = owner;
    expect(
      await updateIssue({ projectId: project.id, id: foreign.id, patch: { title: 'Hijack' } }),
    ).toMatchObject({ ok: false, error: 'Issue not found.' });
    expect(await deleteTicket({ projectId: project.id, id: foreign.id })).toMatchObject({
      ok: false,
    });
    const [row] = await db.select().from(tickets).where(eq(tickets.id, foreign.id));
    expect(row.title).toBe('Foreign');
    expect(row.deletedAt).toBeNull();
  });
});

describe('TKT-05: assign', () => {
  it('assigns to a project member and unassigns', async () => {
    const t = await create();
    expect(
      await updateIssue({ projectId: project.id, id: t.id, patch: { assigneeId: member } }),
    ).toMatchObject({ ok: true });
    const [assigned] = filterIssues(await issuesOf(project.id), {
      stateIds: [],
      assignee: member,
    });
    expect(assigned.assignee?.id).toBe(member);

    expect(
      await updateIssue({ projectId: project.id, id: t.id, patch: { assigneeId: null } }),
    ).toMatchObject({ ok: true });
    const unassigned = filterIssues(await issuesOf(project.id), {
      stateIds: [],
      assignee: UNASSIGNED,
    });
    expect(unassigned.map((i) => i.id)).toContain(t.id);
  });

  it('rejects a non-member assignee', async () => {
    const t = await create();
    expect(
      await updateIssue({ projectId: project.id, id: t.id, patch: { assigneeId: outsider } }),
    ).toMatchObject({ ok: false, error: 'Assignee must be a project member.' });
  });
});

describe('TKT-06: workflow states', () => {
  it('moves through every state', async () => {
    const t = await create();
    for (const stateId of Object.values(project.states)) {
      expect(
        await updateIssue({ projectId: project.id, id: t.id, patch: { stateId } }),
      ).toMatchObject({ ok: true });
      const [row] = await db
        .select({ stateId: tickets.stateId })
        .from(tickets)
        .where(eq(tickets.id, t.id));
      expect(row.stateId).toBe(stateId);
    }
  });

  it("rejects another project's state", async () => {
    const t = await create();
    expect(
      await updateIssue({
        projectId: project.id,
        id: t.id,
        patch: { stateId: otherProject.states.Done },
      }),
    ).toMatchObject({ ok: false, error: 'Invalid state.' });
  });

  it('filters by state', async () => {
    const t = await create();
    const inProgress = project.states['In Progress'];
    await updateIssue({ projectId: project.id, id: t.id, patch: { stateId: inProgress } });
    const rows = filterIssues(await issuesOf(project.id), {
      stateIds: [inProgress],
      assignee: null,
    });
    expect(rows.every((r) => r.stateId === inProgress)).toBe(true);
    expect(rows.map((r) => r.id)).toContain(t.id);
  });
});

describe('authorization', () => {
  it('forbids non-members on every action', async () => {
    const t = await create();
    session.userId = outsider;
    const forbidden = { ok: false, error: 'Forbidden' };
    expect(await createTicket({ projectId: project.id, title: 'x' })).toEqual(forbidden);
    expect(
      await updateIssue({ projectId: project.id, id: t.id, patch: { title: 'x' } }),
    ).toEqual(forbidden);
    expect(await deleteTicket({ projectId: project.id, id: t.id })).toEqual(forbidden);
    expect(
      await updateIssue({ projectId: project.id, id: t.id, patch: { assigneeId: outsider } }),
    ).toEqual(forbidden);
    expect(
      await updateIssue({
        projectId: project.id,
        id: t.id,
        patch: { stateId: project.states.Done },
      }),
    ).toEqual(forbidden);
  });

  it('rejects unauthenticated callers', async () => {
    session.userId = '';
    expect(await createTicket({ projectId: project.id, title: 'x' })).toEqual({
      ok: false,
      error: 'Not authenticated',
    });
  });

  it('getMemberProject returns the project and role only for members', async () => {
    expect(await getMemberProject(project.id, member)).toMatchObject({
      id: project.id,
      ticketKey: project.ticketKey,
      role: 'member',
    });
    expect(await getMemberProject(project.id, owner)).toMatchObject({ role: 'owner' });
    expect(await getMemberProject(project.id, outsider)).toBeNull();
    expect(await getMemberProject('', owner)).toBeNull();
  });

  it('project data and issues are hidden from non-members', async () => {
    await create('Visible to members only');
    expect(await getProjectData(project.id, outsider)).toBeNull();
    expect(await getProjectIssues(project.id, outsider)).toEqual([]);
    const data = await getProjectData(project.id, member);
    expect(data?.project.role).toBe('member');
    expect(data?.states.map((s) => s.name)).toContain('Duplicate');
    expect(data?.members.map((m) => m.id).sort()).toEqual([member, owner].sort());
    expect((await getProjectIssues(project.id, member)).length).toBeGreaterThan(0);
  });

  it('lets a regular member create tickets', async () => {
    session.userId = member;
    const result = await createTicket({ projectId: project.id, title: 'By member' });
    expect(result.ok).toBe(true);
  });
});
