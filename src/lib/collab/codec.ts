// Shared (client + server) pieces of the collaboration protocol: key format,
// base64 for binary Yjs updates in JSON, and the wire types.

export type CollabKind = 'doc' | 'issue';

export const collabKey = (kind: CollabKind, id: string) => `${kind}:${id}`;
export const docCollabKey = (documentId: string) => collabKey('doc', documentId);
export const issueCollabKey = (ticketId: string) => collabKey('issue', ticketId);

/** Awareness rows share the update table (and its id sequence) under this key. */
export const awarenessKey = (key: string) => `aw:${key}`;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function parseCollabKey(key: string): { kind: CollabKind; id: string } | null {
  const at = key.indexOf(':');
  if (at < 0) return null;
  const kind = key.slice(0, at);
  const id = key.slice(at + 1);
  if ((kind !== 'doc' && kind !== 'issue') || !ID.test(id)) return null;
  return { kind, id };
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked: String.fromCharCode(...bigArray) overflows the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Largest accepted update (base64 chars) — well under Vercel's 4.5 MB body cap. */
export const MAX_UPDATE_CHARS = 2_000_000;

export interface CollabRow {
  id: number;
  /** base64 Yjs (or awareness) update */
  u: string;
}

/** GET ?sv= — full sync. */
export interface CollabSyncResponse {
  update: string;
  lastId: number;
  /** True when the key has no state at all yet (seed candidates). */
  empty: boolean;
  awareness: CollabRow[];
  /** False for guests and archived docs: follow along read-only. */
  canWrite: boolean;
}

/** GET ?after= — long-poll. */
export interface CollabPollResponse {
  updates: CollabRow[];
  awareness: CollabRow[];
  lastId: number;
}

export interface CollabPostBody {
  client: string;
  update?: string;
  awareness?: string;
  /** Initial content for an empty key; accepted only while the key is empty. */
  seed?: boolean;
}

export interface CollabPostResponse {
  id: number | null;
  seeded?: boolean;
}
