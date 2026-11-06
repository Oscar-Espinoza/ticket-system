// Shapes of ids that cross the wire. Client-safe.

/** Document, epic and collab-key ids: short, URL-safe. */
export const ENTITY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const isEntityId = (value: unknown): value is string =>
  typeof value === 'string' && ENTITY_ID_RE.test(value);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Client-chosen ids for issues and drafts. */
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);
