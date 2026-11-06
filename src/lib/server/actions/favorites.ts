// Favorites are per-user bookmarks. Toggling only touches the caller's own rows;
// access to the target is re-checked when the sidebar resolves favorites, so a
// favorite on something the user can no longer see simply disappears.

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { favorites } from '@/db/schema';
import {
  fail,
  NOT_AUTHENTICATED,
  refreshesData,
  type ActionResult,
} from '@/lib/server/action-kit';
import { getSession } from '@/lib/session';
import { isFavoriteTarget as isTarget, type FavoriteTarget } from '@/lib/favorite-targets';

export type FavoriteResult = ActionResult<{ favorited: boolean }>;

export async function toggleFavorite(input: {
  targetType: FavoriteTarget;
  targetId: string;
}): Promise<FavoriteResult> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;
  if (!isTarget(input.targetType) || typeof input.targetId !== 'string' || !input.targetId) {
    return fail('Invalid favorite.');
  }
  const userId = session.user.id;
  const match = and(
    eq(favorites.userId, userId),
    eq(favorites.targetType, input.targetType),
    eq(favorites.targetId, input.targetId),
  );

  const removed = await db.delete(favorites).where(match).returning({ id: favorites.id });
  if (removed.length === 0) {
    // New favorites go to the bottom of the sidebar list.
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${favorites.sortOrder}), 0) + 1` })
      .from(favorites)
      .where(eq(favorites.userId, userId));
    await db
      .insert(favorites)
      .values({
        id: crypto.randomUUID(),
        userId,
        targetType: input.targetType,
        targetId: input.targetId,
        sortOrder: Number(next),
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }

  refreshesData();
  return { ok: true, favorited: removed.length === 0 };
}

export async function isFavorited(targetType: FavoriteTarget, targetId: string) {
  const session = await getSession();
  if (!session?.user || !isTarget(targetType) || !targetId) return false;
  const [row] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(
      and(
        eq(favorites.userId, session.user.id),
        eq(favorites.targetType, targetType),
        eq(favorites.targetId, targetId),
      ),
    )
    .limit(1);
  return row != null;
}
