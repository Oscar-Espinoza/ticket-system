// Svelte side of the Postgres-relayed Yjs provider: a shared, ref-counted provider per
// key, its status, the Tiptap Collaboration + caret extensions for
// MarkdownEditor (`extensions`, `history={false}`, `controlled={false}`) and
// the other people currently in the document.
//
// API (call during component init):
//   const collab = useCollab(key | () => key, user | () => user)
//     collab.provider / collab.extensions / collab.snapshot — live getters;
//     read them off the object (destructuring takes a one-time snapshot).
//   const peers = useCollabPeers(provider | () => provider, selfId | () => selfId)
//     peers.current: CollabPeer[]
//   collabColor(userId)

import { browser } from '$app/env';
import { createSubscriber } from 'svelte/reactivity';
import type { AnyExtension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';

import {
  getCollabProvider,
  retainCollabProvider,
  type CollabProvider,
  type CollabSnapshot,
  type CollabUser,
} from '@/lib/collab/provider';

type MaybeGetter<T> = T | (() => T);
const read = <T>(value: MaybeGetter<T>): T => (typeof value === 'function' ? (value as () => T)() : value);

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

// useSyncExternalStore(provider.subscribe, provider.getSnapshot) → one
// subscriber per provider.
const snapshotTrackers = new WeakMap<CollabProvider, () => void>();
function trackSnapshot(provider: CollabProvider) {
  let track = snapshotTrackers.get(provider);
  if (!track) {
    track = createSubscriber((update) => provider.subscribe(update));
    snapshotTrackers.set(provider, track);
  }
  track();
}

export interface UseCollab {
  readonly provider: CollabProvider | null;
  /** Pass to MarkdownEditor with `history={false}` and `controlled={false}`. */
  readonly extensions: AnyExtension[] | undefined;
  readonly snapshot: CollabSnapshot;
}

/**
 * `key` null → nothing is created (single-user mode). The provider is only
 * created in the browser (the server renders the IDLE snapshot, which is
 * what React's useSyncExternalStore server snapshot showed).
 */
export function useCollab(key: MaybeGetter<string | null>, user: MaybeGetter<CollabUser>): UseCollab {
  // Field-wise, so a new user object with the same values changes nothing
  // (React's useMemo deps were the fields).
  const id = $derived(read(user).id);
  const name = $derived(read(user).name);
  const color = $derived(read(user).color);
  const image = $derived(read(user).image);
  const currentKey = $derived(read(key));

  const provider = $derived.by(() => {
    if (!browser || !currentKey) return null;
    return getCollabProvider(currentKey, { id, name, color, image });
  });

  $effect(() => {
    const current = provider;
    if (current) return retainCollabProvider(current);
  });

  // Derived (never proxied): Tiptap extension instances must stay as they are.
  const extensions = $derived.by<AnyExtension[] | undefined>(() =>
    provider
      ? [
          Collaboration.configure({ document: provider.doc }),
          CollaborationCaret.configure({ provider, user: { id, name, color }, render: renderCaret }),
        ]
      : undefined,
  );

  return {
    get provider() {
      return provider;
    },
    get extensions() {
      return extensions;
    },
    get snapshot() {
      const current = provider;
      if (!current) return IDLE;
      trackSnapshot(current);
      return current.getSnapshot();
    },
  };
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
// Stable snapshots: a new array only when someone changed.
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

const awarenessTrackers = new WeakMap<CollabProvider, () => void>();
function trackAwareness(provider: CollabProvider) {
  let track = awarenessTrackers.get(provider);
  if (!track) {
    track = createSubscriber((update) => {
      provider.awareness.on('change', update);
      return () => provider.awareness.off('change', update);
    });
    awarenessTrackers.set(provider, track);
  }
  track();
}

/** Other people in the document right now (awareness), one entry per person. */
export function useCollabPeers(
  provider: MaybeGetter<CollabProvider | null>,
  selfId: MaybeGetter<string>,
): { readonly current: CollabPeer[] } {
  return {
    get current() {
      const current = read(provider);
      if (!current) return NO_PEERS;
      trackAwareness(current);
      return peersSnapshot(current, read(selfId));
    },
  };
}
