// Client-side Yjs provider over the Postgres relay (/api/collab/[key]), in
// place of y-websocket: full state-vector sync, then a long-poll loop for
// other clients' updates + awareness, and local updates POSTed one request at
// a time (merged while one is in flight, retried with backoff). Providers are
// shared per key and ref-counted, so a StrictMode remount or two editors of
// the same key reuse one Y.Doc. See .planning/features/D2-collaborative-editing.md.

import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';

import {
  fromBase64,
  toBase64,
  type CollabPollResponse,
  type CollabPostBody,
  type CollabPostResponse,
  type CollabRow,
  type CollabSyncResponse,
} from './codec';

export type CollabStatus = 'connecting' | 'synced' | 'offline' | 'error';

export interface CollabUser {
  id: string;
  name: string;
  /** #rrggbb — the caret extension ignores anything else. */
  color: string;
  image?: string | null;
}

export interface CollabSnapshot {
  status: CollabStatus;
  /** Past the first full sync (the doc now holds the server state). */
  synced: boolean;
  /** The key had no state at all at the first sync. */
  empty: boolean;
  canWrite: boolean;
  /** Unsent local changes. */
  pending: boolean;
}

/** Full resync this often while connected: heals ids that committed out of order. */
const RESYNC_MS = 60_000;
/** A longer silence (hidden tab, offline) may span a compaction: resync. */
const GAP_MS = 45_000;
const PUSH_DELAY_MS = 120;
const AWARENESS_DELAY_MS = 250;
/** Alone in the doc, cursor moves aren't worth a request each: heartbeat only. */
const ALONE_AWARENESS_MS = 10_000;
/** Before the first sync this many failures mean "collaboration unavailable". */
const FATAL_BEFORE_SYNC = 2;
const RELEASE_DELAY_MS = 1_000;

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

// 413: an update over the size cap would fail forever; the markdown snapshot still saves.
const PERMANENT = new Set([400, 401, 403, 404, 413]);

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done);
  });
}

export class CollabProvider {
  readonly doc = new Y.Doc();
  readonly awareness: Awareness;
  /** Tags our rows so the server can leave them out of our own polls. */
  readonly clientId = crypto.randomUUID().replaceAll('-', '');
  private readonly url: string;
  private snapshot: CollabSnapshot = { status: 'connecting', synced: false, empty: false, canWrite: false, pending: false };
  private listeners = new Set<() => void>();
  private lastId = 0;
  private lastOk = 0;
  private lastFullSync = 0;
  private failures = 0;
  private queue: Uint8Array[] = [];
  private pushing = false;
  /** Pushes wait while a seed is in flight: the seed only lands on an empty key. */
  private holding = false;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pushDelay = PUSH_DELAY_MS;
  private awarenessTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAwarenessSent = 0;
  private started = false;
  private stopped = false;
  private abort = new AbortController();

  constructor(
    readonly key: string,
    user: CollabUser,
  ) {
    this.url = `/api/collab/${encodeURIComponent(key)}`;
    this.awareness = new Awareness(this.doc);
    this.awareness.setLocalStateField('user', user);
    this.doc.on('update', this.onDocUpdate);
    this.awareness.on('update', this.onAwarenessUpdate);
  }

  // --- React store -----------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  private set(patch: Partial<CollabSnapshot>) {
    const next = { ...this.snapshot, ...patch };
    if ((Object.keys(patch) as (keyof CollabSnapshot)[]).every((k) => next[k] === this.snapshot[k])) return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  // --- lifecycle -------------------------------------------------------------

  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.loop();
  }

  destroy() {
    if (this.stopped) return;
    this.stopped = true;
    this.abort.abort();
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.awarenessTimer) clearTimeout(this.awarenessTimer);
    window.removeEventListener('pagehide', this.onPageHide);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.started) {
      this.flushOnExit();
      // Tell the others we left (their copies would otherwise linger ~30 s).
      removeAwarenessStates(this.awareness, [this.doc.clientID], 'destroy');
      this.send({ awareness: toBase64(encodeAwarenessUpdate(this.awareness, [this.doc.clientID])) }, true).catch(() => {});
    }
    this.doc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    this.awareness.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }

  private onPageHide = () => this.flushOnExit();

  private onVisibility = () => {
    // Coming back: stop waiting, the loop resyncs if the gap was long.
    if (document.visibilityState === 'visible') this.visibleWaiter?.();
  };

  private visibleWaiter: (() => void) | null = null;

  private waitVisible() {
    return new Promise<void>((resolve) => {
      this.visibleWaiter = () => {
        this.visibleWaiter = null;
        resolve();
      };
      this.abort.signal.addEventListener('abort', () => this.visibleWaiter?.(), { once: true });
    });
  }

  // --- network ---------------------------------------------------------------

  private async request<T>(input: string, init?: RequestInit): Promise<T> {
    const response = await fetch(input, { cache: 'no-store', ...init });
    if (!response.ok) throw new HttpError(response.status);
    return (await response.json()) as T;
  }

  // Writes are never aborted (an aborted push would drop its update); on exit
  // they use keepalive, which browsers cap at 64 KB per request.
  private send(body: Omit<CollabPostBody, 'client'>, exiting = false) {
    const payload = JSON.stringify({ ...body, client: this.clientId } satisfies CollabPostBody);
    return this.request<CollabPostResponse>(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: exiting && payload.length < 60_000,
    });
  }

  private async fullSync() {
    const sv = toBase64(Y.encodeStateVector(this.doc));
    const res = await this.request<CollabSyncResponse>(
      `${this.url}?sv=${encodeURIComponent(sv)}`,
      { signal: this.abort.signal },
    );
    if (this.stopped) return;
    Y.applyUpdate(this.doc, fromBase64(res.update), this);
    this.applyAwareness(res.awareness);
    this.lastId = Math.max(this.lastId, res.lastId);
    this.lastFullSync = Date.now();
    const first = !this.snapshot.synced;
    this.set({ synced: true, canWrite: res.canWrite, ...(first ? { empty: res.empty } : {}) });
    if (first) {
      // Anything typed before the first sync waited for the write permission.
      if (this.queue.length) this.schedulePush();
      this.sendAwareness(true);
    }
  }

  private async longPoll() {
    const res = await this.request<CollabPollResponse>(
      `${this.url}?after=${this.lastId}&client=${this.clientId}`,
      { signal: this.abort.signal },
    );
    if (this.stopped) return;
    if (res.updates.length) {
      const updates = res.updates.map((row) => fromBase64(row.u));
      Y.applyUpdate(this.doc, updates.length === 1 ? updates[0] : Y.mergeUpdates(updates), this);
    }
    this.applyAwareness(res.awareness);
    this.lastId = Math.max(this.lastId, res.lastId);
  }

  private applyAwareness(rows: CollabRow[]) {
    const before = new Set(this.awareness.getStates().keys());
    for (const row of rows) {
      try {
        applyAwarenessUpdate(this.awareness, fromBase64(row.u), this);
      } catch {
        // A bad row only costs one cursor.
      }
    }
    // Someone new joined: show them where we are now, not at our next heartbeat.
    for (const id of this.awareness.getStates().keys()) {
      if (!before.has(id) && id !== this.doc.clientID) {
        this.sendAwareness(true);
        break;
      }
    }
  }

  private async loop() {
    while (!this.stopped) {
      if (document.visibilityState === 'hidden') {
        await this.waitVisible();
        continue;
      }
      try {
        const now = Date.now();
        const stale = now - this.lastOk > GAP_MS || now - this.lastFullSync > RESYNC_MS;
        if (!this.snapshot.synced || stale) await this.fullSync();
        else await this.longPoll();
        this.lastOk = Date.now();
        this.failures = 0;
        if (!this.stopped) this.set({ status: 'synced' });
      } catch (err) {
        if (this.stopped) return;
        this.failures += 1;
        const permanent = err instanceof HttpError && PERMANENT.has(err.status);
        if (permanent || (!this.snapshot.synced && this.failures >= FATAL_BEFORE_SYNC)) {
          this.set({ status: 'error' });
          if (permanent) return;
        } else {
          this.set({ status: this.snapshot.synced ? 'offline' : 'connecting' });
        }
        await wait(Math.min(1_000 * 2 ** (this.failures - 1), 30_000), this.abort.signal);
      }
    }
  }

  // --- local changes ---------------------------------------------------------

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return;
    this.queue.push(update);
    this.set({ pending: true });
    this.schedulePush();
  };

  private schedulePush() {
    if (this.pushTimer || this.stopped) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.push();
    }, this.pushDelay);
  }

  private async push() {
    if (this.pushing || this.holding || this.queue.length === 0 || !this.snapshot.synced) return;
    if (!this.snapshot.canWrite) {
      // Read-only viewers: local edits (shouldn't happen) never leave the tab.
      this.queue = [];
      this.set({ pending: false });
      return;
    }
    this.pushing = true;
    const update = this.queue.length === 1 ? this.queue[0] : Y.mergeUpdates(this.queue);
    this.queue = [];
    try {
      await this.send({ update: toBase64(update) });
      this.pushDelay = PUSH_DELAY_MS;
      // The key has state now; a later editor on this provider must not try to seed.
      this.set({ empty: false });
    } catch (err) {
      if (this.stopped) return;
      if (err instanceof HttpError && err.status === 403) {
        this.set({ canWrite: false });
      } else if (!(err instanceof HttpError && PERMANENT.has(err.status))) {
        // Keep it (merged with anything typed meanwhile) and retry with backoff.
        this.queue.unshift(update);
        this.pushDelay = Math.min(this.pushDelay * 2 + 500, 30_000);
        this.set({ status: 'offline' });
      }
    } finally {
      this.pushing = false;
      this.set({ pending: this.queue.length > 0 });
      if (this.queue.length) this.schedulePush();
    }
  }

  /** Last chance on navigation / tab close: fire-and-forget with keepalive. */
  private flushOnExit() {
    if (!this.queue.length || !this.snapshot.synced || !this.snapshot.canWrite) return;
    const update = this.queue.length === 1 ? this.queue[0] : Y.mergeUpdates(this.queue);
    this.queue = [];
    this.send({ update: toBase64(update) }, true).catch(() => {});
  }

  /**
   * Initial content for an empty key. The server keeps it only while the key
   * is still empty; otherwise someone else seeded first and we catch up.
   */
  async seed(update: Uint8Array): Promise<boolean> {
    this.holding = true;
    try {
      const res = await this.send({ update: toBase64(update), seed: true });
      if (res.seeded) {
        Y.applyUpdate(this.doc, update, this);
        return true;
      }
    } catch {
      // Fall through to a catch-up sync.
    } finally {
      this.holding = false;
      this.set({ empty: false });
      if (this.queue.length) this.schedulePush();
    }
    try {
      await this.fullSync();
    } catch {
      // The poll loop keeps trying.
    }
    return false;
  }

  // --- awareness -------------------------------------------------------------

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin !== 'local') return;
    const self = this.doc.clientID;
    if (![...added, ...updated, ...removed].includes(self)) return;
    if (this.awarenessTimer || this.stopped) return;
    this.awarenessTimer = setTimeout(() => {
      this.awarenessTimer = null;
      this.sendAwareness();
    }, AWARENESS_DELAY_MS);
  };

  private sendAwareness(force = false) {
    if (this.stopped || !this.snapshot.synced || document.visibilityState === 'hidden') return;
    const self = this.doc.clientID;
    const alone = [...this.awareness.getStates().keys()].every((id) => id === self);
    if (!force && alone && Date.now() - this.lastAwarenessSent < ALONE_AWARENESS_MS) return;
    this.lastAwarenessSent = Date.now();
    const update = encodeAwarenessUpdate(this.awareness, [self]);
    this.send({ awareness: toBase64(update) }).catch(() => {});
  }
}

// --- shared, ref-counted instances ------------------------------------------

interface Entry {
  provider: CollabProvider;
  refs: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const registry = new Map<string, Entry>();

/** The provider for `key` (created, not started, if needed). Pure enough for render. */
export function getCollabProvider(key: string, user: CollabUser): CollabProvider {
  let entry = registry.get(key);
  if (!entry) {
    entry = { provider: new CollabProvider(key, user), refs: 0, timer: null };
    registry.set(key, entry);
  }
  return entry.provider;
}

/** Keeps the provider running while retained; call the result to release. */
export function retainCollabProvider(provider: CollabProvider): () => void {
  let entry = registry.get(provider.key);
  if (!entry || entry.provider !== provider) {
    entry = { provider, refs: 0, timer: null };
    registry.set(provider.key, entry);
  }
  const current = entry;
  if (current.timer) clearTimeout(current.timer);
  current.timer = null;
  current.refs += 1;
  provider.start();
  return () => {
    current.refs -= 1;
    if (current.refs > 0) return;
    // Delayed so a StrictMode remount / quick reopen keeps the synced doc.
    current.timer = setTimeout(() => {
      if (current.refs > 0) return;
      if (registry.get(provider.key) === current) registry.delete(provider.key);
      provider.destroy();
    }, RELEASE_DELAY_MS);
  };
}
