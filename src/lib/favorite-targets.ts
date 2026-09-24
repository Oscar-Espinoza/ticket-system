// Kept out of the 'use server' actions file, which may only export async functions.
export const FAVORITE_TARGETS = [
  'project',
  'issue',
  'view',
  'epic',
  'cycle',
  'initiative',
] as const;
export type FavoriteTarget = (typeof FAVORITE_TARGETS)[number];

export function isFavoriteTarget(value: unknown): value is FavoriteTarget {
  return typeof value === 'string' && (FAVORITE_TARGETS as readonly string[]).includes(value);
}
