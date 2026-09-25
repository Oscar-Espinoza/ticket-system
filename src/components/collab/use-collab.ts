'use client';

// React side of the Postgres-relayed Yjs provider: a shared, ref-counted
// provider per key, its status, the Tiptap Collaboration + caret extensions
// for D1's MarkdownEditor (`extensions`, `history: false`, `controlled: false`)
// and the other people currently in the document.

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { AnyExtension } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';

import {
  getCollabProvider,
  retainCollabProvider,
  type CollabProvider,
  type CollabSnapshot,
  type CollabUser,
} from '@/lib/collab/provider';

// Readable on both themes, and the caret extension only accepts #rrggbb.
const COLORS = ['#e5484d', '#f76b15', '#d6a100', '#30a46c', '#12a594', '#0090ff', '#3e63dd', '#8e4ec6', '#d6409f'];

export function collabColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

export interface CollabPeer {
  clientId: number;
  id: string;
  name: string;
  image: string | null;
  color: string;
}

const IDLE: CollabSnapshot = { status: 'connecting', synced: false, empty: false, canWrite: false, pending: false };
const noop = () => () => {};

function renderCaret(user: Record<string, unknown>): HTMLElement {
  const caret = document.createElement('span');
  caret.className = 'pointer-events-none relative -mx-px border-x border-solid break-normal';
  caret.style.borderColor = String(user.color ?? 'transparent');
  const label = document.createElement('span');
  label.className =
    'absolute -top-[1.15em] -left-px select-none whitespace-nowrap rounded-sm rounded-bl-none px-1 text-[10px] font-medium leading-[1.3] text-white';
  label.style.backgroundColor = String(user.color ?? 'transparent');
  label.textContent = String(user.name ?? '');
  caret.append(label);
  return caret;
}

export interface UseCollab {
  provider: CollabProvider | null;
  /** Pass to MarkdownEditor with `history={false}` and `controlled={false}`. */
  extensions: AnyExtension[] | undefined;
  snapshot: CollabSnapshot;
}

/** `key` null → nothing is created (single-user mode). */
export function useCollab(key: string | null, user: CollabUser): UseCollab {
  const { id, name, color, image } = user;
  const provider = useMemo(
    () => (key ? getCollabProvider(key, { id, name, color, image }) : null),
    [key, id, name, color, image],
  );

  useEffect(() => (provider ? retainCollabProvider(provider) : undefined), [provider]);

  const snapshot = useSyncExternalStore(
    provider?.subscribe ?? noop,
    provider?.getSnapshot ?? (() => IDLE),
    () => IDLE,
  );

  const extensions = useMemo<AnyExtension[] | undefined>(
    () =>
      provider
        ? [
            Collaboration.configure({ document: provider.doc }),
            CollaborationCaret.configure({ provider, user: { id, name, color }, render: renderCaret }),
          ]
        : undefined,
    [provider, id, name, color],
  );

  return { provider, extensions, snapshot };
}

function readPeers(provider: CollabProvider, selfId: string): CollabPeer[] {
  const seen = new Set<string>();
  const peers: CollabPeer[] = [];
  provider.awareness.getStates().forEach((state, clientId) => {
    if (clientId === provider.doc.clientID) return;
    const user = (state as { user?: Partial<CollabPeer> }).user;
    // Your other tabs aren't "someone else".
    if (!user?.id || !user.name || user.id === selfId || seen.has(user.id)) return;
    seen.add(user.id);
    peers.push({ clientId, id: user.id, name: user.name, image: user.image ?? null, color: user.color ?? '#6b7280' });
  });
  return peers.sort((a, b) => a.name.localeCompare(b.name));
}

const NO_PEERS: CollabPeer[] = [];
// Stable snapshots for useSyncExternalStore: a new array only when someone changed.
const peerCache = new WeakMap<CollabProvider, { key: string; peers: CollabPeer[] }>();

function peersSnapshot(provider: CollabProvider, selfId: string): CollabPeer[] {
  const next = readPeers(provider, selfId);
  const key = next.map((p) => `${p.clientId}:${p.id}:${p.name}:${p.color}`).join('|');
  const cached = peerCache.get(provider);
  if (cached && cached.key === key) return cached.peers;
  const peers = next.length ? next : NO_PEERS;
  peerCache.set(provider, { key, peers });
  return peers;
}

/** Other people in the document right now (awareness), one entry per person. */
export function useCollabPeers(provider: CollabProvider | null, selfId: string): CollabPeer[] {
  const subscribe = useMemo(
    () => (listener: () => void) => {
      if (!provider) return () => {};
      provider.awareness.on('change', listener);
      return () => provider.awareness.off('change', listener);
    },
    [provider],
  );
  return useSyncExternalStore(
    subscribe,
    () => (provider ? peersSnapshot(provider, selfId) : NO_PEERS),
    () => NO_PEERS,
  );
}
