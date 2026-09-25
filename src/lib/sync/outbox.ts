// Offline outbox (client only). Issue mutations that can't reach the server —
// the browser is offline or the request failed on the network — are stored as
// data (server action name + args) in IndexedDB and replayed in order when the
// connection returns. The server stays the judge: replay is the same server
// action, later, so authorization/validation run as usual and the last write
// wins. Ops the server rejects are dropped with a toast.
//
// Shared by every tab: one IndexedDB store, a BroadcastChannel to tell other
// tabs to re-read it, and a Web Lock so only one tab drains at a time. If
// IndexedDB is unavailable (private mode, blocked, quota) the first failure
// switches this tab to an in-memory queue.

import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import type { IssuePatch, IssueRow } from '@/lib/issue-model';

import { runOutboxAction, type OutboxActionName, type OutboxArgs, type OutboxResult } from './actions';
import { broadcastOutboxChanged, broadcastProjectChanged, onOutboxChanged } from './broadcast';

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
// In-memory mirror (what hooks render)
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

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  loaded = reload();
  onOutboxChanged(() => void reload());
  const wake = () => void flush();
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
  void loaded.then(() => flush());
}

/** A failed fetch (offline, DNS, dropped connection) rather than a server answer. */
function isNetworkError(error: unknown) {
  return !navigator.onLine || error instanceof TypeError;
}

function friendlyError(error: string) {
  return error === 'Forbidden' ? "you don't have permission to do that in this project" : error;
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
export async function perform<N extends OutboxActionName>(call: OutboxCall<N>): Promise<OutboxResult<N> | Queued> {
  setSyncUser(call.userId);
  await loaded;
  if (!navigator.onLine || pendingFor(call.userId).length > 0) return enqueue(call);
  try {
    const result = await runOutboxAction(call.action, call.args);
    if (result.ok) broadcastProjectChanged(call.projectId);
    return result;
  } catch (error) {
    if (isNetworkError(error)) return enqueue(call);
    throw error;
  }
}

export function isQueued(result: object): result is Queued {
  return 'queued' in result;
}

/** Replay the current user's queued ops (one tab at a time). */
export async function flush(): Promise<void> {
  clearTimeout(retryTimer);
  // Offline: the `online` listener resumes.
  if (flushing || !currentUser || !navigator.onLine) return;
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
  if (currentUser && pendingFor(currentUser).length > 0) {
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
      const head = (await readAll()).find((item) => item.userId === user);
      if (!head) break;

      let result: OutboxResult<OutboxActionName>;
      try {
        result = await runOutboxAction(head.action, head.args);
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
// Hooks
// ---------------------------------------------------------------------------

/** Every queued op in this browser (all users / projects), in queue order. */
export function useOutboxItems(): OutboxItem[] {
  return useSyncExternalStore(subscribe, () => items, () => EMPTY);
}
