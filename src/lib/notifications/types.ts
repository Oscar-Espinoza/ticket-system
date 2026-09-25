// Notification types, their preference toggles and the one-line sentence the
// inbox, emails and badges render. Client-safe (no server imports).

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
  // Inserted by cron jobs (D5 / D8), not by dispatch.
  'sla_breached',
  'recurring_created',
  'pulse',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** Types the user can switch off. Reminders are self-set, so always on. */
export const NOTIFICATION_PREFS: { type: NotificationType; label: string; description: string }[] = [
  { type: 'assigned', label: 'Assigned to me', description: 'Someone assigns an issue to you.' },
  { type: 'mentioned', label: 'Mentions', description: 'Someone @mentions you in a comment or description.' },
  { type: 'commented', label: 'Comments', description: 'New comments on issues you subscribe to.' },
  { type: 'status_changed', label: 'Status changes', description: 'An issue you subscribe to changes status.' },
  { type: 'completed', label: 'Completed', description: 'An issue you subscribe to is completed or canceled.' },
  { type: 'github', label: 'Pull requests', description: 'A pull request linked to a subscribed issue is merged.' },
  { type: 'sla_breached', label: 'SLA breaches', description: 'An issue you follow misses its SLA deadline.' },
  { type: 'pulse', label: 'Pulse', description: 'A weekly summary of activity in your projects.' },
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
  const who = actor ?? (type === 'github' ? 'GitHub' : 'Automation');
  switch (type) {
    case 'assigned':
      return `${who} assigned you`;
    case 'mentioned':
      return data.commentId ? `${who} mentioned you in a comment` : `${who} mentioned you`;
    case 'commented':
      return `${who} commented`;
    case 'status_changed':
      return data.state ? `${who} moved it to ${data.state.name}` : `${who} changed the status`;
    case 'completed':
      return data.state ? `${who} marked it ${data.state.name}` : `${who} completed it`;
    case 'reminder':
      return 'Reminder';
    case 'github':
      return data.summary ? `${capitalize(data.summary)}` : 'Pull request merged';
    case 'sla_breached':
      return data.summary ? capitalize(data.summary) : 'SLA breached';
    case 'recurring_created':
      return data.summary ? capitalize(data.summary) : 'Created from a recurring schedule';
    case 'pulse':
      return data.summary ? capitalize(data.summary) : 'Your weekly pulse';
    default:
      // Unknown / future types: a summary reads as "Ana <summary>" or stands alone.
      if (data.summary) return actor ? `${actor} ${data.summary}` : capitalize(data.summary);
      return `${who} updated the issue`;
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
