// Linear groups the inbox per issue: one row per issue showing its latest
// notification. Notifications without an issue stand alone.

import type { InboxNotification } from '@/lib/notifications/inbox';

export interface InboxGroup {
  key: string;
  ticketId: string | null;
  projectId: string | null;
  /** Newest first. */
  items: InboxNotification[];
  latest: InboxNotification;
  unread: boolean;
}

/** `list` must be newest-first; group order follows each group's newest item. */
export function groupNotifications(list: InboxNotification[]): InboxGroup[] {
  const byKey = new Map<string, InboxNotification[]>();
  for (const notification of list) {
    const key = notification.ticketId ?? notification.id;
    const items = byKey.get(key);
    if (items) items.push(notification);
    else byKey.set(key, [notification]);
  }
  return [...byKey].map(([key, items]) => ({
    key,
    ticketId: items[0].ticketId,
    projectId: items[0].projectId,
    items,
    latest: items[0],
    unread: items.some((item) => !item.readAt),
  }));
}

export function byNewest(a: InboxNotification, b: InboxNotification) {
  return new Date(b.at).getTime() - new Date(a.at).getTime();
}
