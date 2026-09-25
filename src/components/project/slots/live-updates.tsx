'use client';

// Owner: B12 (data & realtime). Mounted once by the project layout.
//
// Live updates without websockets (Vercel Hobby): poll a cheap change token
// every 5 s while the tab is visible and router.refresh() when it moves —
// debounced, and never while the user is typing (a refresh would clobber
// uncontrolled drafts). Also keeps this project's presence channel alive.
//
// Presence: one ref-counted heartbeat channel per project, shared by
// LiveUpdates and HeaderPresence (which also works outside the project layout,
// e.g. in cross-project peeks). Heartbeat every 15 s while visible, right away
// when the viewed issue changes, and a sendBeacon "leave" on pagehide.

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

const POLL_MS = 5_000;
const POLL_BACKOFF_MS = 30_000;
const REFRESH_DEBOUNCE_MS = 400;
const HEARTBEAT_MS = 15_000;
/** Collapses bursts (layout + detail pane mounting together) into one POST. */
const HEARTBEAT_SOON_MS = 150;

const TEXT_INPUTS = new Set([
  'text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date',
  'datetime-local', 'month', 'time', 'week',
]);

/** A focused text field / editor — refreshing now could clobber what's typed. */
function isEditing(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el instanceof HTMLInputElement && TEXT_INPUTS.has(el.type);
}

const stopStatus = (status: number) => status === 401 || status === 403 || status === 404;

// ---------------------------------------------------------------------------
// Presence store
// ---------------------------------------------------------------------------

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

/**
 * Other members active in the project (with the issue each is on). Passing a
 * ticketId also announces that this viewer is on that issue.
 */
export function useProjectPresence(projectId: string, ticketId: string | null = null): PresenceUser[] {
  useEffect(() => {
    acquire(projectId, ticketId);
    return () => release(projectId, ticketId);
  }, [projectId, ticketId]);

  const subscribe = useCallback(
    (notify: () => void) => {
      const ch = getChannel(projectId);
      ch.listeners.add(notify);
      return () => ch.listeners.delete(notify);
    },
    [projectId],
  );
  return useSyncExternalStore(
    subscribe,
    () => channels.get(projectId)?.users ?? EMPTY,
    () => EMPTY,
  );
}

// ---------------------------------------------------------------------------
// LiveUpdates
// ---------------------------------------------------------------------------

export function LiveUpdates({ projectId }: { projectId: string }) {
  const router = useRouter();
  useProjectPresence(projectId);

  useEffect(() => {
    let token: string | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let stopped = false;
    let waitingForBlur = false;

    const refresh = () => {
      if (stopped) return;
      if (isEditing()) {
        if (!waitingForBlur) {
          waitingForBlur = true;
          document.addEventListener('focusout', onFocusOut);
        }
        return;
      }
      router.refresh();
    };
    // Focus may be moving to another field; re-check once it has landed.
    function onFocusOut() {
      setTimeout(() => {
        if (isEditing()) return;
        waitingForBlur = false;
        document.removeEventListener('focusout', onFocusOut);
        refresh();
      }, 0);
    }

    const check = async () => {
      clearTimeout(pollTimer);
      if (stopped || inFlight) return;
      // Resumed by the visibility / focus / online listeners below.
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      inFlight = true;
      let delay = POLL_MS;
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/changes`, {
          cache: 'no-store',
        });
        if (stopStatus(res.status)) {
          stopped = true;
          return;
        }
        if (res.ok) {
          const next = ((await res.json()) as { token: string }).token;
          if (token !== null && next !== token) {
            clearTimeout(refreshTimer);
            refreshTimer = setTimeout(refresh, REFRESH_DEBOUNCE_MS);
          }
          token = next;
        } else {
          delay = POLL_BACKOFF_MS;
        }
      } catch {
        delay = POLL_BACKOFF_MS;
      } finally {
        inFlight = false;
      }
      if (!stopped) pollTimer = setTimeout(() => void check(), delay);
    };

    const wake = () => void check();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') wake();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    void check();

    return () => {
      stopped = true;
      clearTimeout(pollTimer);
      clearTimeout(refreshTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
    };
  }, [projectId, router]);

  return null;
}
