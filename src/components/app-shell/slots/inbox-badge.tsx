// Owner: B2 (notifications). Unread count at the end of the sidebar Inbox link.
// Streams in its own Suspense boundary so the count query never holds up the
// shell; the client pill then keeps itself fresh.

import { Suspense } from 'react';

import { InboxBadgeCount } from '@/components/inbox/inbox-badge-count';
import { countUnreadNotifications } from '@/lib/notifications/inbox';

export interface InboxBadgeProps {
  /** Session user id (already authenticated by the dashboard layout). */
  userId: string;
}

export function InboxBadge({ userId }: InboxBadgeProps) {
  return (
    <Suspense fallback={null}>
      <UnreadCount userId={userId} />
    </Suspense>
  );
}

async function UnreadCount({ userId }: InboxBadgeProps) {
  const count = await countUnreadNotifications(userId).catch((err) => {
    console.error('[inbox] unread count failed', err);
    return 0;
  });
  return <InboxBadgeCount initial={count} />;
}
