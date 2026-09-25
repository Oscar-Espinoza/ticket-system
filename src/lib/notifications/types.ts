// Notification types, their preference toggles and the one-line sentence the
// inbox, emails and badges render. Client-safe (no server imports).

import type { StateType } from '@/lib/issue-model';

export const NOTIFICATION_TYPES = [
  'assigned',
  'mentioned',
  'commented',
  'status_changed',
  'completed',
  'reminder',
  'github',
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
];

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
    default:
      return data.summary ? `${who} ${data.summary}` : `${who} updated the issue`;
  }
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Window event the inbox fires after changing read state, so the badge refetches. */
export const INBOX_CHANGED_EVENT = 'inbox:changed';
