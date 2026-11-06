// Presence (awareness) rows for collaborative docs are normally pruned when the
// same doc gets its next cursor update; docs nobody reopens keep a few stale
// rows, so sweep anything older than an hour once a day.

import { and, like, lt } from 'drizzle-orm';

import { db } from '@/lib/db';
import { collabUpdates } from '@/db/schema';
import { HOUR_MS } from '@/lib/time';

export async function run(now: Date): Promise<string> {
  const cutoff = new Date(now.getTime() - HOUR_MS);
  const removed = await db
    .delete(collabUpdates)
    .where(and(like(collabUpdates.key, 'aw:%'), lt(collabUpdates.createdAt, cutoff)))
    .returning({ id: collabUpdates.id });
  return `removed ${removed.length} stale presence rows`;
}
