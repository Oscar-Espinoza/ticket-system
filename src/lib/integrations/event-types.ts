// Event vocabularies for Slack and outgoing webhooks. Client-safe (the settings
// UI renders these lists), so no imports from events.ts (which pulls in the db).

/** Issue event types a webhook can subscribe to. An empty selection = all types. */
export const WEBHOOK_EVENT_TYPES = [
  { type: 'issue.created', label: 'Issue created' },
  { type: 'issue.updated', label: 'Issue updated' },
  { type: 'comment.created', label: 'Comment created' },
  { type: 'comment.updated', label: 'Comment edited' },
  { type: 'comment.deleted', label: 'Comment deleted' },
  { type: 'issue.archived', label: 'Issue archived' },
  { type: 'issue.unarchived', label: 'Issue unarchived' },
  { type: 'issue.deleted', label: 'Issue moved to trash' },
  { type: 'issue.restored', label: 'Issue restored' },
  { type: 'issue.purged', label: 'Issue permanently deleted' },
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]['type'];

const WEBHOOK_TYPES = new Set<string>(WEBHOOK_EVENT_TYPES.map((e) => e.type));

export function isWebhookEventType(value: unknown): value is WebhookEventType {
  return typeof value === 'string' && WEBHOOK_TYPES.has(value);
}

export const SLACK_EVENTS = [
  { kind: 'created', label: 'Issue created' },
  { kind: 'completed', label: 'Issue completed' },
  { kind: 'canceled', label: 'Issue canceled' },
  { kind: 'commented', label: 'New comment' },
] as const;

export type SlackEventKind = (typeof SLACK_EVENTS)[number]['kind'];

const SLACK_KINDS = new Set<string>(SLACK_EVENTS.map((e) => e.kind));
const ALL_SLACK_KINDS = SLACK_EVENTS.map((e) => e.kind) as SlackEventKind[];

export function isSlackEventKind(value: unknown): value is SlackEventKind {
  return typeof value === 'string' && SLACK_KINDS.has(value);
}

export const SLACK_URL_PREFIX = 'https://hooks.slack.com/';

export interface SlackSetting {
  /** The webhook URL, never with a fragment. */
  url: string;
  events: SlackEventKind[];
}

/** Known kinds in canonical order; unknown strings dropped. */
export function normalizeSlackEvents(events: readonly unknown[]): SlackEventKind[] {
  return ALL_SLACK_KINDS.filter((kind) => events.includes(kind));
}

/**
 * The effective Slack setting from `project.slack_webhook_url` +
 * `project.slack_events` (null = all kinds). Before the column existed the
 * toggles rode in the URL fragment (`…#events=created,commented`); such a
 * fragment is still honoured while `slack_events` is null, and the next save
 * rewrites both columns without it.
 */
export function parseSlackSetting(
  stored: string | null | undefined,
  events: readonly string[] | null | undefined,
): SlackSetting | null {
  if (!stored) return null;
  const hash = stored.indexOf('#');
  const url = hash === -1 ? stored : stored.slice(0, hash);
  if (!url) return null;
  if (events) return { url, events: normalizeSlackEvents(events) };
  if (hash !== -1) {
    const legacy = new URLSearchParams(stored.slice(hash + 1)).get('events');
    if (legacy !== null) return { url, events: normalizeSlackEvents(legacy.split(',')) };
  }
  return { url, events: ALL_SLACK_KINDS };
}
