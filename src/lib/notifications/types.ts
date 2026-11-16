// Notification types, their preference toggles and the one-line sentence the
// inbox, emails and badges render. Client-safe (no server imports).

import { m } from '@/lib/i18n';
import type { StateType } from '@/lib/issue-model';
import { issuePath } from '@/lib/issue-links';

export const NOTIFICATION_TYPES = [
  'assigned',
  'mentioned',
  'commented',
  'status_changed',
  'completed',
  'reminder',
  'github',
  // Created by cron jobs and the recurring runner, not by dispatch.
  'sla_breached',
  'follow_up',
  'recurring_created',
  'pulse',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Types the user can switch off. Reminders are self-set, so always on. */
export const NOTIFICATION_PREFS: { type: NotificationType; label: string; description: string }[] = [
  {
    type: 'assigned',
    get label() { return m.editor_notif_pref_assigned(); },
    get description() { return m.editor_notif_pref_assigned_desc(); },
  },
  {
    type: 'mentioned',
    get label() { return m.editor_notif_pref_mentioned(); },
    get description() { return m.editor_notif_pref_mentioned_desc(); },
  },
  {
    type: 'commented',
    get label() { return m.editor_notif_pref_commented(); },
    get description() { return m.editor_notif_pref_commented_desc(); },
  },
  {
    type: 'status_changed',
    get label() { return m.editor_notif_pref_status(); },
    get description() { return m.editor_notif_pref_status_desc(); },
  },
  {
    type: 'completed',
    get label() { return m.editor_notif_pref_completed(); },
    get description() { return m.editor_notif_pref_completed_desc(); },
  },
  {
    type: 'github',
    get label() { return m.editor_notif_pref_github(); },
    get description() { return m.editor_notif_pref_github_desc(); },
  },
  {
    type: 'sla_breached',
    get label() { return m.editor_notif_pref_sla(); },
    get description() { return m.editor_notif_pref_sla_desc(); },
  },
  {
    type: 'follow_up',
    get label() { return m.editor_notif_pref_follow_up(); },
    get description() { return m.editor_notif_pref_follow_up_desc(); },
  },
  {
    type: 'pulse',
    get label() { return m.editor_notif_pref_pulse(); },
    get description() { return m.editor_notif_pref_pulse_desc(); },
  },
];

/** In digest mode these still email right away; everything else waits for the digest. */
export const DIGEST_IMMEDIATE_TYPES: ReadonlySet<string> = new Set(['assigned', 'mentioned']);

export const DIGEST_FREQUENCIES = ['off', 'daily', 'weekly'] as const;
export type DigestFrequency = (typeof DIGEST_FREQUENCIES)[number];

export function isDigestFrequency(value: unknown): value is DigestFrequency {
  return typeof value === 'string' && (DIGEST_FREQUENCIES as readonly string[]).includes(value);
}

/** Stored on notification.data so the inbox renders without extra lookups. */
export interface NotificationData {
  key?: string;
  title?: string;
  /** Event summary for integration events (e.g. "merged PR #12"). */
  summary?: string;
  state?: { name: string; type: StateType };
  /** Plain-text comment excerpt (mentions stripped). */
  excerpt?: string;
  commentId?: string;
  /** Extra detail lines for issue-less notifications (e.g. pulse). */
  lines?: string[];
  /** Relative app path for issue-less notifications, e.g. "/dashboard/dashboards?tab=pulse". */
  url?: string;
}

export function notificationData(value: unknown): NotificationData {
  return value && typeof value === 'object' ? (value as NotificationData) : {};
}

/** Missing prefs mean "on". */
export function prefEnabled(prefs: Record<string, boolean> | null | undefined, type: string) {
  return prefs?.[type] !== false;
}

/**
 * "Ana assigned you", "Ana moved it to In Review", "Reminder". `actor` is the
 * display name, or null for system/integration events.
 */
export function describeNotification(
  type: string,
  data: NotificationData,
  actor: string | null,
): string {
  const who = actor ?? m.editor_notif_automation();
  switch (type) {
    case 'assigned':
      return m.editor_notif_assigned({ who });
    case 'mentioned':
      return data.commentId ? m.editor_notif_mentioned_comment({ who }) : m.editor_notif_mentioned({ who });
    case 'commented':
      return m.editor_notif_commented({ who });
    case 'status_changed':
      return data.state ? m.editor_notif_moved({ who, state: data.state.name }) : m.editor_notif_status_changed({ who });
    case 'completed':
      return data.state ? m.editor_notif_marked({ who, state: data.state.name }) : m.editor_notif_completed({ who });
    case 'reminder':
      return m.editor_notif_reminder();
    case 'github': // pull / merge requests of every code host
      return data.summary ? `${capitalize(data.summary)}` : m.editor_notif_pr_merged();
    case 'sla_breached':
      return data.summary ? capitalize(data.summary) : m.editor_notif_sla_breached();
    case 'follow_up':
      return data.summary ? capitalize(data.summary) : m.editor_notif_follow_up();
    case 'recurring_created':
      return data.summary ? capitalize(data.summary) : m.editor_notif_recurring();
    case 'pulse':
      return data.summary ? capitalize(data.summary) : m.editor_notif_pulse();
    default:
      // Unknown / future types: a summary reads as "Ana <summary>" or stands alone.
      if (data.summary) return actor ? `${actor} ${data.summary}` : capitalize(data.summary);
      return m.editor_notif_updated({ who });
  }
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Relative link for a notification: the issue permalink, else a same-app
 * `data.url`, else the inbox.
 */
export function notificationPath(projectId: string | null | undefined, data: NotificationData): string {
  if (projectId && data.key) return issuePath(projectId, data.key);
  if (typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//')) return data.url;
  return '/dashboard/inbox';
}

/** Window event the inbox fires after changing read state, so the badge refetches. */
export const INBOX_CHANGED_EVENT = 'inbox:changed';
