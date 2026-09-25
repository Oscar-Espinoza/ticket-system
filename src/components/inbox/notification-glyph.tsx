import { AlarmClock, GitMerge, Zap } from 'lucide-react';

import { Avatar } from '@/components/ui-icons';
import type { InboxNotification } from '@/lib/notifications/inbox';
import { describeNotification } from '@/lib/notifications/types';

/** Actor avatar, or a glyph for reminders and system / GitHub events. */
export function NotificationGlyph({
  notification,
  size = 24,
}: {
  notification: InboxNotification;
  size?: 20 | 24;
}) {
  if (notification.actor && notification.type !== 'reminder') {
    return <Avatar name={notification.actor.name} src={notification.actor.image} size={size} />;
  }
  const Icon =
    notification.type === 'reminder' ? AlarmClock : notification.type === 'github' ? GitMerge : Zap;
  return (
    <span
      aria-hidden="true"
      className={
        size === 24
          ? 'flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-3.5'
          : 'flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-3'
      }
    >
      <Icon />
    </span>
  );
}

export function notificationSentence(notification: InboxNotification): string {
  return describeNotification(notification.type, notification.data, notification.actor?.name ?? null);
}
