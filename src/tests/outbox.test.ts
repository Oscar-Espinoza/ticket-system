import { beforeEach, describe, expect, it, vi } from 'vitest';

// The server: one committed-issue store keyed by the create's client id, and a
// session whose user the test switches. It mirrors runOutboxCall's contract.
const server = vi.hoisted(() => ({
  sessionUser: 'user-a' as string | null,
  created: new Map<string, { title: string; by: string }>(),
  calls: [] as { queueOwner: string; action: string; args: Record<string, unknown> }[],
  loseNextResponse: false,
}));

// The generated client wrapper the Svelte outbox calls (same contract as the action).
vi.mock('@/lib/actions/sync', () => ({
  runOutboxCall: vi.fn(async (call: { queueOwner: string; action: string; args: Record<string, unknown> }) => {
    server.calls.push(call);
    if (call.queueOwner !== server.sessionUser) {
      return { ok: false, suspended: true, error: 'Signed in as a different account.' };
    }
    if (call.action === 'createTicket') {
      const id = String(call.args.clientId);
      if (!server.created.has(id)) server.created.set(id, { title: String(call.args.title), by: server.sessionUser });
    }
    if (server.loseNextResponse) {
      server.loseNextResponse = false;
      throw new TypeError('Failed to fetch'); // committed, but the response never arrived
    }
    return { ok: true };
  }),
}));
vi.mock('@/lib/sync/actions', () => ({}));
vi.mock('svelte-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));
vi.mock('@/lib/svelte/refresh.svelte', () => ({ refreshAfterWrite: vi.fn(async () => undefined) }));
vi.mock('@/lib/sync/broadcast', () => ({
  broadcastOutboxChanged: vi.fn(),
  broadcastProjectChanged: vi.fn(),
  onOutboxChanged: vi.fn(),
}));

const nav = { onLine: true };
vi.stubGlobal('navigator', nav);

const outbox = await import('@/lib/svelte/outbox.svelte');

const createCall = (userId: string, title: string) => ({
  userId,
  projectId: 'p1',
  action: 'createTicket' as const,
  args: { projectId: 'p1', title },
  overlay: null,
  label: `creating “${title}”`,
});

async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('offline outbox', () => {
  beforeEach(() => {
    server.calls.length = 0;
    server.created.clear();
    server.sessionUser = 'user-a';
    nav.onLine = true;
  });

  it('a replay after a lost response reuses the create’s client id (review finding #4)', async () => {
    server.loseNextResponse = true;
    const first = await outbox.perform(createCall('user-a', 'Lost response'));
    expect(outbox.isQueued(first)).toBe(true);
    await outbox.flush();
    await settle();

    const creates = server.calls.filter((c) => c.action === 'createTicket');
    expect(creates.length).toBe(2);
    expect(creates[0].args.clientId).toBeTruthy();
    expect(creates[1].args.clientId).toBe(creates[0].args.clientId);
    expect(server.created.size).toBe(1);
  });

  it('never replays one user’s queue under another user’s session (review finding #5)', async () => {
    outbox.setSyncUser('user-a');
    nav.onLine = false;
    await outbox.perform(createCall('user-a', 'Queued by A'));
    // A signs out and B signs in in another tab; this stale tab still thinks it is A.
    server.sessionUser = 'user-b';
    nav.onLine = true;
    await outbox.flush();
    await settle();

    expect(server.created.size).toBe(0);
    expect(server.calls.every((c) => c.queueOwner === 'user-a')).toBe(true);
    // Still queued for A, not dropped.
    // (useOutboxItems is a hook; check via a fresh flush once A is back.)
    server.sessionUser = 'user-a';
    outbox.setSyncUser('user-b');
    outbox.setSyncUser('user-a'); // a wake event clears the suspension
    await settle();
    await outbox.flush();
    await settle();
    expect([...server.created.values()]).toEqual([{ title: 'Queued by A', by: 'user-a' }]);
  });
});

describe('offline outbox: queues from before idempotency keys (Sol review #7)', () => {
  it('keys a stored create durably before its first replay', async () => {
    server.calls.length = 0;
    server.created.clear();
    server.sessionUser = 'user-a';
    nav.onLine = false;
    // Queue it, then strip the key as an old build would have stored it.
    await outbox.perform(createCall('user-a', 'Old build'));
    // (No IndexedDB in tests: the memory queue hands out the stored objects.)
    const items = await outbox.peekOutbox();
    for (const item of items) delete (item.args as { clientId?: string }).clientId;
    nav.onLine = true;
    server.loseNextResponse = true;
    await outbox.flush();
    await new Promise((r) => setTimeout(r, 10));
    await outbox.flush();
    await new Promise((r) => setTimeout(r, 10));
    const creates = server.calls.filter((c) => c.action === 'createTicket');
    expect(creates.length).toBe(2);
    expect(creates[0].args.clientId).toBeTruthy();
    expect(creates[1].args.clientId).toBe(creates[0].args.clientId);
    expect(server.created.size).toBe(1);
  });
});
