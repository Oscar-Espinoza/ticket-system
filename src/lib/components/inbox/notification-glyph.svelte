<!-- Actor avatar, or a glyph for reminders and system / GitHub / cron events. -->
<script module lang="ts">
  import type { InboxNotification } from '@/lib/notifications/inbox';
  import { describeNotification } from '@/lib/notifications/types';

  export function notificationSentence(notification: InboxNotification): string {
    return describeNotification(notification.type, notification.data, notification.actor?.name ?? null);
  }
</script>

<script lang="ts">
  import Activity from '@lucide/svelte/icons/activity';
  import AlarmClock from '@lucide/svelte/icons/alarm-clock';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import Repeat from '@lucide/svelte/icons/repeat';
  import TimerOff from '@lucide/svelte/icons/timer-off';
  import Zap from '@lucide/svelte/icons/zap';

  import { Avatar } from '@/lib/components/ui-icons';
  import { cn } from '@/lib/utils';

  const SYSTEM_ICONS: Record<string, typeof Zap> = {
    reminder: AlarmClock,
    github: GitMerge,
    sla_breached: TimerOff,
    follow_up: CalendarClock,
    recurring_created: Repeat,
    pulse: Activity,
  };

  let { notification, size = 24 }: { notification: InboxNotification; size?: 20 | 24 } = $props();

  // SLA breaches, follow-ups and reminders are about the issue, not whoever last touched it.
  const system = $derived(
    notification.type === 'reminder' || notification.type === 'sla_breached' || notification.type === 'follow_up',
  );
  const Icon = $derived(SYSTEM_ICONS[notification.type] ?? Zap);
</script>

{#if notification.actor && !system}
  <Avatar name={notification.actor.name} src={notification.actor.image} {size} />
{:else}
  <span
    aria-hidden="true"
    class={cn(
      'flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
      size === 24 ? 'size-6 [&_svg]:size-3.5' : 'size-5 [&_svg]:size-3',
      notification.type === 'sla_breached' && 'text-red-500',
    )}
  >
    <Icon />
  </span>
{/if}
