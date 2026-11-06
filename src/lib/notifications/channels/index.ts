// External delivery channels, fanned out after in-app notification rows are
// written (dispatch.ts) and by jobs that insert notifications directly. Each
// channel owns its file and never throws.

import { inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/db/schema';
import type { notifications } from '@/db/schema';

import { deliverPush } from './push';
import { deliverSlackDm } from './slack-dm';

export type ChannelNotification = typeof notifications.$inferInsert;

/** Display names of the rows' actors by user id, loaded once and only when a channel asks. */
export type ActorNames = () => Promise<Map<string, string>>;

function lazyActorNames(rows: ChannelNotification[]): ActorNames {
  let loaded: Promise<Map<string, string>> | undefined;
  return () =>
    (loaded ??= (async () => {
      const ids = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => !!id))];
      if (ids.length === 0) return new Map<string, string>();
      const actors = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, ids));
      return new Map(actors.map((actor) => [actor.id, actor.name]));
    })());
}

export async function deliverToChannels(rows: ChannelNotification[]): Promise<void> {
  // Reminders and snoozed rows surface later; delivering them now would be early.
  const now = Date.now();
  const live = rows.filter((row) => !row.snoozedUntil || row.snoozedUntil.getTime() <= now);
  if (live.length === 0) return;
  const actorNames = lazyActorNames(live);
  await Promise.allSettled([deliverPush(live, actorNames), deliverSlackDm(live, actorNames)]);
}
