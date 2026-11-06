// Presence timing shared by the heartbeat client and the presence route.
// Client-safe.

/** How often a visible tab announces itself. */
export const PRESENCE_HEARTBEAT_MS = 15_000;

/** A member counts as present this long after their last heartbeat (three missed beats). */
export const PRESENCE_WINDOW_MS = 45_000;
