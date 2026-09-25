// External delivery channels, fanned out after in-app notification rows are
// written (dispatch.ts) and by jobs that insert notifications directly. Each
// channel owns its file and never throws.

import type { notifications } from '@/db/schema';

import { deliverPush } from './push';
import { deliverSlackDm } from './slack-dm';

export type ChannelNotification = typeof notifications.$inferInsert;

export async function deliverToChannels(rows: ChannelNotification[]): Promise<void> {
  if (rows.length === 0) return;
  await Promise.allSettled([deliverPush(rows), deliverSlackDm(rows)]);
}
