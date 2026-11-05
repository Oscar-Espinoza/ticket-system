// Presence store behind <LiveUpdates> and HeaderPresence (port of the presence
// half of src/components/project/slots/live-updates.tsx). The component itself
// is live-updates.svelte; import this module WITH its extension:
//   import { useProjectPresence, type PresenceUser } from '@/lib/components/project/slots/live-updates.svelte.ts';
//
// Presence: one ref-counted heartbeat channel per project, shared by
// LiveUpdates and HeaderPresence (which also works outside the project layout,
// e.g. in cross-project peeks). Heartbeat every 15 s while visible, right away
// when the viewed issue changes, and a sendBeacon "leave" on pagehide.
//
//   const presence = useProjectPresence(() => projectId, () => ticketId);
//   presence.current   other members active in the project (reactive)

const HEARTBEAT_MS = 15_000;
/** Collapses bursts (layout + detail pane mounting together) into one POST. */
const HEARTBEAT_SOON_MS = 150;

const stopStatus = (status: number) => status === 401 || status === 403 || status === 404;

export interface PresenceUser {
  id: string;
  name: string;
  image: string | null;
  ticketId: string | null;
}

interface Channel {
  refs: number;
  /** Ticket ids being viewed, most recent last (several panes may be open). */
  viewing: string[];
  users: PresenceUser[];
  listeners: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | undefined;
  stopped: boolean;
}

const EMPTY: PresenceUser[] = [];
const channels = new Map<string, Channel>();
let pageListeners = false;

function getChannel(projectId: string): Channel {
  let ch = channels.get(projectId);
  if (!ch) {
    ch = { refs: 0, viewing: [], users: EMPTY, listeners: new Set(), timer: undefined, stopped: false };
    channels.set(projectId, ch);
  }
  return ch;
}

function setUsers(ch: Channel, users: PresenceUser[]) {
  ch.users = users.length ? users : EMPTY;
  ch.listeners.forEach((notify) => notify());
}

const presenceUrl = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/presence`;

function leave(projectId: string) {
  const body = new Blob([JSON.stringify({ leave: true })], { type: 'application/json' });
  navigator.sendBeacon?.(presenceUrl(projectId), body);
}

function schedule(projectId: string, delay: number) {
  const ch = getChannel(projectId);
  clearTimeout(ch.timer);
  if (ch.refs > 0 && !ch.stopped) ch.timer = setTimeout(() => void heartbeat(projectId), delay);
}

async function heartbeat(projectId: string) {
  const ch = getChannel(projectId);
  if (ch.refs === 0 || ch.stopped) return;
  // Hidden tabs stay quiet: others see us drop off after the 45 s window.
  if (document.visibilityState === 'visible' && navigator.onLine) {
    try {
      const res = await fetch(presenceUrl(projectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ch.viewing.at(-1) ?? null }),
        cache: 'no-store',
      });
      if (stopStatus(res.status)) {
        ch.stopped = true;
        setUsers(ch, EMPTY);
        return;
      }
      if (res.ok && ch.refs > 0) setUsers(ch, ((await res.json()) as { users: PresenceUser[] }).users);
    } catch {
      // Offline or a blip — the next beat retries.
    }
  }
  schedule(projectId, HEARTBEAT_MS);
}

function ensurePageListeners() {
  if (pageListeners) return;
  pageListeners = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    for (const id of channels.keys()) schedule(id, HEARTBEAT_SOON_MS);
  });
  window.addEventListener('pagehide', () => {
    for (const [id, ch] of channels) if (ch.refs > 0 && !ch.stopped) leave(id);
  });
}

function acquire(projectId: string, ticketId: string | null) {
  ensurePageListeners();
  const ch = getChannel(projectId);
  ch.refs++;
  if (ticketId) ch.viewing.push(ticketId);
  schedule(projectId, HEARTBEAT_SOON_MS);
}

function release(projectId: string, ticketId: string | null) {
  const ch = getChannel(projectId);
  ch.refs = Math.max(0, ch.refs - 1);
  if (ticketId) {
    const i = ch.viewing.lastIndexOf(ticketId);
    if (i !== -1) ch.viewing.splice(i, 1);
  }
  if (ch.refs > 0) {
    schedule(projectId, HEARTBEAT_SOON_MS);
    return;
  }
  clearTimeout(ch.timer);
  if (!ch.stopped) leave(projectId);
  setUsers(ch, EMPTY);
}

type MaybeGetter<T> = T | (() => T);
const read = <T>(value: MaybeGetter<T>): T => (typeof value === 'function' ? (value as () => T)() : value);

/**
 * Other members active in the project (with the issue each is on). Passing a
 * ticketId also announces that this viewer is on that issue. Call during
 * component init; pass getters when the ids can change. Empty during SSR.
 */
export function useProjectPresence(
  projectId: MaybeGetter<string>,
  ticketId: MaybeGetter<string | null> = null,
): { readonly current: PresenceUser[] } {
  // Bumped by the channel's listeners (useSyncExternalStore's subscribe).
  let version = $state(0);

  $effect(() => {
    const pid = read(projectId);
    const tid = read(ticketId);
    acquire(pid, tid);
    return () => release(pid, tid);
  });

  $effect(() => {
    const ch = getChannel(read(projectId));
    const notify = () => {
      version += 1;
    };
    ch.listeners.add(notify);
    return () => {
      ch.listeners.delete(notify);
    };
  });

  return {
    get current() {
      void version;
      return channels.get(read(projectId))?.users ?? EMPTY;
    },
  };
}
