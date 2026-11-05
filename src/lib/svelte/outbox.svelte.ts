// Offline outbox (client only). Issue mutations that can't reach the server —
// the browser is offline or the request failed on the network — are stored as
// data (server action name + args) in IndexedDB and replayed in order when the
// connection returns. The server stays the judge: replay is the same server
// action, later, so authorization/validation run as usual and the last write
// wins. Ops the server rejects are dropped with a toast.
//
// Every call goes through runOutboxCall with the queue owner's id: the server
// refuses ("suspends") a call whose session belongs to someone else, and the op
// stays queued for its owner. Creates carry a client-chosen issue id, so a
// replay after a lost response returns the issue the first attempt created.
//
// Shared by every tab: one IndexedDB store, a BroadcastChannel to tell other
// tabs to re-read it, and a Web Lock so only one tab drains at a time. If
// IndexedDB is unavailable (private mode, blocked, quota) the first failure
// switches this tab to an in-memory queue.
//
// Svelte port of src/lib/sync/outbox.ts — same engine, same exports, same
// IndexedDB store / channel / lock names (so a queue left by the Next app
// replays here). A full copy rather than a wrapper because that module imports
// React (useSyncExternalStore), React sonner and the server action directly.
//   setSyncUser(userId), perform(call), flush(), peekOutbox(), isQueued(result)
//   useOutboxItems() → { current: OutboxItem[] }   reactive (was a React hook)
//
// Under Next, a successful server action carried the route's revalidated data
// back with it. The generated runOutboxCall wrapper can't know that the queued
// actions revalidate (they do it through runOutboxAction), so `send` refreshes
// the page data itself after every successful call, replays included.

import { refreshAfterWrite } from '@/lib/svelte/refresh.svelte';
import { createSubscriber } from 'svelte/reactivity';
import { toast } from 'svelte-sonner';

import type { IssuePatch, IssueRow } from '@/lib/issue-model';
import { runOutboxCall, type OutboxSuspended } from '@/lib/actions/sync';
import type { OutboxActionName, OutboxArgs, OutboxResult } from '@/lib/sync/actions';
import { broadcastOutboxChanged, broadcastProjectChanged, onOutboxChanged } from '@/lib/sync/broadcast';

/** How a queued op shows up on the issue list until it has synced. */
export type OutboxOverlay =
  | { kind: 'patch'; ids: string[]; patch: IssuePatch }
  | { kind: 'set'; ids: string[]; fields: Partial<Pick<IssueRow, 'archivedAt' | 'deletedAt'>> }
  | { kind: 'add'; issue: IssueRow };

export interface OutboxCall<N extends OutboxActionName = OutboxActionName> {
  userId: string;
  projectId: string;
  action: N;
  args: OutboxArgs<N>;
  overlay: OutboxOverlay | null;
  /** Lower-case phrase for toasts, e.g. "status change on APP-12". */
  label: string;
}

export interface OutboxItem extends OutboxCall {
  /** Store key; ascending = queue order. */
  seq: number;
  attempts: number;
  createdAt: number;
}

/** What `perform` returns when the op was queued instead of sent. */
export interface Queued {
  ok: true;
  queued: true;
}

const DB_NAME = 'ticket-sync';
const STORE = 'outbox';
const LOCK = 'ticket-sync:outbox';
/** Thrown (non-network) failures before an op is given up on, e.g. a deploy renamed the action. */
const MAX_ATTEMPTS = 3;
const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 60_000;
const QUEUED: Queued = { ok: true, queued: true };
const EMPTY: OutboxItem[] = [];

// ---------------------------------------------------------------------------
// Storage: IndexedDB, or memory once IndexedDB has failed
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;
let memory: OutboxItem[] | null = null;
let memorySeq = 0;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  return dbPromise;
}

async function idb<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? req.error);
    tx.onabort = () => reject(tx.error ?? req.error);
  });
}

async function withStore<T>(viaDb: () => Promise<T>, viaMemory: (queue: OutboxItem[]) => T): Promise<T> {
  if (!memory) {
    try {
      return await viaDb();
    } catch {
      // Keep what this tab already knows about and carry on in memory.
      memory = [...items];
      memorySeq = memory.reduce((max, item) => Math.max(max, item.seq), 0);
    }
  }
  return viaMemory(memory);
}

const bySeq = (a: OutboxItem, b: OutboxItem) => a.seq - b.seq;

const readAll = () =>
  withStore(
    () => idb('readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>),
    (queue) => [...queue],
  ).then((all) => all.sort(bySeq));

const addItem = (item: Omit<OutboxItem, 'seq'>) =>
  withStore(
    () => idb('readwrite', (s) => s.add(item)).then(() => undefined),
    (queue) => void queue.push({ ...item, seq: ++memorySeq }),
  );

const putItem = (item: OutboxItem) =>
  withStore(
    () => idb('readwrite', (s) => s.put(item)).then(() => undefined),
    (queue) => {
      const i = queue.findIndex((q) => q.seq === item.seq);
      if (i !== -1) queue[i] = item;
    },
  );

const deleteItem = (seq: number) =>
  withStore(
    () => idb('readwrite', (s) => s.delete(seq)).then(() => undefined),
    (queue) => {
      const i = queue.findIndex((q) => q.seq === seq);
      if (i !== -1) queue.splice(i, 1);
    },
  );

// ---------------------------------------------------------------------------
// In-memory mirror (what components render)
// ---------------------------------------------------------------------------

let items: OutboxItem[] = EMPTY;
const listeners = new Set<() => void>();
let reloadVersion = 0;

async function reload() {
  const version = ++reloadVersion;
  let next: OutboxItem[];
  try {
    next = await readAll();
  } catch {
    return;
  }
  // A later reload started meanwhile — its snapshot is fresher.
  if (version !== reloadVersion) return;
  items = next.length ? next : EMPTY;
  listeners.forEach((notify) => notify());
}

/** After a write: refresh this tab's mirror and tell the other tabs. */
async function changed() {
  await reload();
  broadcastOutboxChanged();
}

const pendingFor = (userId: string) => items.filter((item) => item.userId === userId);

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

let currentUser: string | null = null;
let loaded: Promise<void> = Promise.resolve();
let started = false;
let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = RETRY_MIN_MS;
/** The server said this tab's session isn't the queue owner's; wait for a wake event. */
let suspended = false;
let suspendWarnedAt = 0;

function warnSuspended(message: string) {
  // Every focus retries once; don't repeat the same warning each time.
  if (Date.now() - suspendWarnedAt < 60_000) return;
  suspendWarnedAt = Date.now();
  toast.warning(message);
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  loaded = reload();
  onOutboxChanged(() => void reload());
  const wake = () => {
    suspended = false;
    void flush();
  };
  window.addEventListener('online', wake);
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake();
  });
  void loaded.then(wake);
}

/** The signed-in user whose ops this tab may replay (another account's stay queued). */
export function setSyncUser(userId: string) {
  start();
  if (currentUser === userId) return;
  currentUser = userId;
  suspended = false;
  void loaded.then(() => flush());
}

/** A failed fetch (offline, DNS, dropped connection) rather than a server answer. */
function isNetworkError(error: unknown) {
  return !navigator.onLine || error instanceof TypeError;
}

function friendlyError(error: string) {
  return error === 'Forbidden' ? "you don't have permission to do that in this project" : error;
}

const isSuspended = (result: object): result is OutboxSuspended =>
  'suspended' in result && (result as OutboxSuspended).suspended === true;

/** Give a create its idempotency key before the first attempt, so every retry reuses it. */
function withClientId<N extends OutboxActionName>(call: OutboxCall<N>): OutboxCall<N> {
  if (call.action !== 'createTicket') return call;
  const args = call.args as OutboxArgs<'createTicket'>;
  if (args.clientId) return call;
  return { ...call, args: { ...args, clientId: crypto.randomUUID() } as OutboxArgs<N> };
}

// Next applied the action's revalidatePath to the open route; do the same.
//
async function send<N extends OutboxActionName>(
  call: Pick<OutboxCall<N>, 'userId' | 'action' | 'args'>,
): Promise<OutboxResult<N> | OutboxSuspended> {
  const result = await runOutboxCall({ queueOwner: call.userId, action: call.action, args: call.args });
  if (result.ok) await refreshAfterWrite();
  return result as OutboxResult<N> | OutboxSuspended;
}

async function enqueue(call: OutboxCall): Promise<Queued> {
  await addItem({ ...call, attempts: 0, createdAt: Date.now() });
  await changed();
  void flush();
  return QUEUED;
}

/**
 * Run a queueable server action: straight to the server when online and
 * nothing is waiting, otherwise (or when the request fails on the network)
 * queued — so ops always reach the server in the order they were made.
 */
export async function perform<N extends OutboxActionName>(
  original: OutboxCall<N>,
): Promise<OutboxResult<N> | Queued> {
  const call = withClientId(original);
  setSyncUser(call.userId);
  await loaded;
  if (!navigator.onLine || pendingFor(call.userId).length > 0) return enqueue(call as OutboxCall);
  try {
    const result = await send(call);
    if (isSuspended(result)) {
      // This page's user isn't the session's: keep the change for its owner.
      suspended = true;
      warnSuspended('You’re signed in as a different account in another tab — reload to continue.');
      return enqueue(call as OutboxCall);
    }
    if (result.ok) broadcastProjectChanged(call.projectId);
    return result;
  } catch (error) {
    if (isNetworkError(error)) return enqueue(call as OutboxCall);
    throw error;
  }
}

/** Every stored op, in queue order (diagnostics and tests). */
export const peekOutbox = (): Promise<OutboxItem[]> => readAll();

export function isQueued(result: object): result is Queued {
  return 'queued' in result;
}

/** Replay the current user's queued ops (one tab at a time). */
export async function flush(): Promise<void> {
  clearTimeout(retryTimer);
  // Offline: the `online` listener resumes.
  if (flushing || suspended || !currentUser || !navigator.onLine) return;
  flushing = true;
  try {
    if ('locks' in navigator && navigator.locks) {
      // Another tab holding the lock is already draining the shared store.
      await navigator.locks.request(LOCK, { ifAvailable: true }, async (lock) => {
        if (lock) await drain();
      });
    } else {
      await drain();
    }
  } catch {
    // Storage or lock failure — the retry timer tries again.
  } finally {
    flushing = false;
  }
  if (!suspended && currentUser && pendingFor(currentUser).length > 0) {
    retryTimer = setTimeout(() => void flush(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
  } else {
    retryDelay = RETRY_MIN_MS;
  }
}

async function drain() {
  let synced = 0;
  try {
    for (;;) {
      if (!navigator.onLine) break;
      const user = currentUser;
      // Re-read every time: other tabs may have added (or finished) ops.
      let head = (await readAll()).find((item) => item.userId === user);
      if (!head) break;
      // Creates queued before ops had idempotency keys: key them, durably,
      // before the first replay (we hold the lock, so no other tab sends it).
      const keyed = withClientId(head);
      if (keyed !== head) {
        await putItem(keyed as OutboxItem);
        head = keyed as OutboxItem;
      }

      let result: OutboxResult<OutboxActionName> | OutboxSuspended;
      try {
        result = await send(head);
      } catch (error) {
        if (isNetworkError(error)) break;
        if (head.attempts + 1 < MAX_ATTEMPTS) {
          await putItem({ ...head, attempts: head.attempts + 1 });
          await changed();
          break; // back off before trying it again
        }
        await deleteItem(head.seq);
        await changed();
        toast.error(`Couldn't sync ${head.label} — the change was discarded.`);
        continue;
      }

      if (isSuspended(result)) {
        // Wrong (or no) session for this queue: leave it intact for its owner.
        suspended = true;
        warnSuspended('Offline changes are waiting for their account — sign in as that user to sync them.');
        break;
      }
      await deleteItem(head.seq);
      await changed();
      if (result.ok) {
        synced += 1;
        broadcastProjectChanged(head.projectId);
      } else {
        toast.error(`Couldn't sync ${head.label}: ${friendlyError(result.error)}`);
      }
    }
  } finally {
    if (synced > 0) toast.success(synced === 1 ? 'Synced 1 offline change' : `Synced ${synced} offline changes`);
  }
}

// ---------------------------------------------------------------------------
// Reactive view (was the useOutboxItems hook)
// ---------------------------------------------------------------------------

const trackItems = createSubscriber((update) => subscribe(update));

const outboxItems = {
  get current(): OutboxItem[] {
    trackItems();
    return items;
  },
};

/**
 * Every queued op in this browser (all users / projects), in queue order.
 * Reactive: read `.current` in markup, $derived or $effect. Empty during SSR.
 */
export function useOutboxItems(): { readonly current: OutboxItem[] } {
  return outboxItems;
}
