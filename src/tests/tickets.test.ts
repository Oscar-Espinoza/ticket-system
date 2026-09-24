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
import { projectMembers, projects, tickets, users } from '@/db/schema';
import {
  assignTicket,
  createTicket,
  deleteTicket,
  setTicketStatus,
  updateTicket,
} from '@/app/actions/tickets';
import { getProjectTickets } from '@/lib/tickets';
import { STATUS_ORDER, UNASSIGNED, type TicketStatus } from '@/lib/issue-model';

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

async function insertProject(ownerId: string, memberIds: string[] = []) {
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
  projectIds.push(id);
  return { id, ticketKey };
}

let owner: string;
let member: string;
let outsider: string;
let project: { id: string; ticketKey: string };
let otherProject: { id: string; ticketKey: string };

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
    expect(a.status).toBe('backlog');
    expect(a.assignee).toBeNull();
    expect(a.title).toBe('First');
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

  it('accepts an initial status and trims the title', async () => {
    const result = await createTicket({
      projectId: project.id,
      title: '  Board card  ',
      status: 'in_review',
    });
    expect(result.ok && result.ticket?.status).toBe('in_review');
    expect(result.ok && result.ticket?.title).toBe('Board card');
  });

  it('rejects empty and oversized titles', async () => {
    expect(await createTicket({ projectId: project.id, title: '   ' })).toMatchObject({
      ok: false,
      field: 'title',
    });
    expect(
      await createTicket({ projectId: project.id, title: 'x'.repeat(201) }),
    ).toMatchObject({ ok: false, field: 'title' });
  });
});

describe('TKT-03/04: edit and delete', () => {
  it('updates title and description', async () => {
    const t = await create();
    expect(
      await updateTicket({
        projectId: project.id,
        id: t.id,
        title: 'Renamed',
        description: 'Details',
      }),
    ).toEqual({ ok: true });
    const [row] = await db.select().from(tickets).where(eq(tickets.id, t.id));
    expect(row.title).toBe('Renamed');
    expect(row.description).toBe('Details');
  });

  it('deletes a ticket', async () => {
    const t = await create();
    expect(await deleteTicket({ projectId: project.id, id: t.id })).toEqual({ ok: true });
    const rows = await db.select().from(tickets).where(eq(tickets.id, t.id));
    expect(rows).toHaveLength(0);
  });

  it('never touches a ticket through another project id', async () => {
    session.userId = outsider;
    const foreign = await create('Foreign', otherProject.id);
    session.userId = owner;
    expect(
      await updateTicket({ projectId: project.id, id: foreign.id, title: 'Hijack' }),
    ).toMatchObject({ ok: false, error: 'Issue not found.' });
    expect(await deleteTicket({ projectId: project.id, id: foreign.id })).toMatchObject({
      ok: false,
    });
    const [row] = await db.select().from(tickets).where(eq(tickets.id, foreign.id));
    expect(row.title).toBe('Foreign');
  });
});

describe('TKT-05: assign', () => {
  it('assigns to a project member and unassigns', async () => {
    const t = await create();
    expect(
      await assignTicket({ projectId: project.id, id: t.id, assigneeId: member }),
    ).toEqual({ ok: true });
    const [assigned] = await getProjectTickets(project.id, {
      statuses: [],
      assignee: member,
    });
    expect(assigned.assignee?.id).toBe(member);

    expect(
      await assignTicket({ projectId: project.id, id: t.id, assigneeId: null }),
    ).toEqual({ ok: true });
    const unassigned = await getProjectTickets(project.id, {
      statuses: [],
      assignee: UNASSIGNED,
    });
    expect(unassigned.map((i) => i.id)).toContain(t.id);
  });

  it('rejects a non-member assignee', async () => {
    const t = await create();
    expect(
      await assignTicket({ projectId: project.id, id: t.id, assigneeId: outsider }),
    ).toMatchObject({ ok: false, error: 'Assignee must be a project member.' });
  });
});

describe('TKT-06: status', () => {
  it('moves through all five statuses', async () => {
    const t = await create();
    for (const status of STATUS_ORDER) {
      expect(await setTicketStatus({ projectId: project.id, id: t.id, status })).toEqual({
        ok: true,
      });
      const [row] = await db
        .select({ status: tickets.status })
        .from(tickets)
        .where(eq(tickets.id, t.id));
      expect(row.status).toBe(status);
    }
  });

  it('rejects an unknown status', async () => {
    const t = await create();
    expect(
      await setTicketStatus({
        projectId: project.id,
        id: t.id,
        status: 'canceled' as TicketStatus,
      }),
    ).toMatchObject({ ok: false, error: 'Invalid status.' });
  });

  it('filters by status', async () => {
    const t = await create();
    await setTicketStatus({ projectId: project.id, id: t.id, status: 'in_progress' });
    const rows = await getProjectTickets(project.id, {
      statuses: ['in_progress'],
      assignee: null,
    });
    expect(rows.every((r) => r.status === 'in_progress')).toBe(true);
    expect(rows.map((r) => r.id)).toContain(t.id);
  });
});

describe('authorization', () => {
  it('forbids non-members on every action', async () => {
    const t = await create();
    session.userId = outsider;
    const forbidden = { ok: false, error: 'Forbidden' };
    expect(await createTicket({ projectId: project.id, title: 'x' })).toEqual(forbidden);
    expect(await updateTicket({ projectId: project.id, id: t.id, title: 'x' })).toEqual(
      forbidden,
    );
    expect(await deleteTicket({ projectId: project.id, id: t.id })).toEqual(forbidden);
    expect(
      await assignTicket({ projectId: project.id, id: t.id, assigneeId: outsider }),
    ).toEqual(forbidden);
    expect(
      await setTicketStatus({ projectId: project.id, id: t.id, status: 'done' }),
    ).toEqual(forbidden);
  });

  it('rejects unauthenticated callers', async () => {
    session.userId = '';
    expect(await createTicket({ projectId: project.id, title: 'x' })).toEqual({
      ok: false,
      error: 'Not authenticated',
    });
  });

  it('lets a regular member create tickets', async () => {
    session.userId = member;
    const result = await createTicket({ projectId: project.id, title: 'By member' });
    expect(result.ok).toBe(true);
  });
});
