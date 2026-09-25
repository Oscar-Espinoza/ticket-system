import { Activity, AlarmClock, GitMerge, Repeat, TimerOff, Zap, type LucideIcon } from 'lucide-react';

import { Avatar } from '@/components/ui-icons';
import type { InboxNotification } from '@/lib/notifications/inbox';
import { describeNotification } from '@/lib/notifications/types';
import { cn } from '@/lib/utils';

const SYSTEM_ICONS: Record<string, LucideIcon> = {
  reminder: AlarmClock,
  github: GitMerge,
  sla_breached: TimerOff,
  recurring_created: Repeat,
  pulse: Activity,
};

/** Actor avatar, or a glyph for reminders and system / GitHub / cron events. */
export function NotificationGlyph({
  notification,
  size = 24,
}: {
  notification: InboxNotification;
  size?: 20 | 24;
}) {
  // SLA breaches and reminders are about the issue, not whoever last touched it.
  const system = notification.type === 'reminder' || notification.type === 'sla_breached';
  if (notification.actor && !system) {
    return <Avatar name={notification.actor.name} src={notification.actor.image} size={size} />;
  }
  const Icon = SYSTEM_ICONS[notification.type] ?? Zap;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
        size === 24 ? 'size-6 [&_svg]:size-3.5' : 'size-5 [&_svg]:size-3',
        notification.type === 'sla_breached' && 'text-red-500',
      )}
    >
      <Icon />
    </span>
  );
}

export function notificationSentence(notification: InboxNotification): string {
  return describeNotification(notification.type, notification.data, notification.actor?.name ?? null);
}
