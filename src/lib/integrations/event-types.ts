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
  url: string;
  events: SlackEventKind[];
}

// The project table has only `slack_webhook_url`, so the event toggles live in
// the URL fragment (`…#events=created,commented`). fetch never sends the
// fragment, and these two functions are the only code that reads or writes it.
export function parseSlackSetting(stored: string | null | undefined): SlackSetting | null {
  if (!stored) return null;
  const hash = stored.indexOf('#');
  if (hash === -1) return { url: stored, events: ALL_SLACK_KINDS };
  const params = new URLSearchParams(stored.slice(hash + 1));
  const raw = params.get('events');
  const events =
    raw === null ? ALL_SLACK_KINDS : raw.split(',').filter(isSlackEventKind);
  return { url: stored.slice(0, hash), events };
}

export function formatSlackSetting({ url, events }: SlackSetting): string {
  const base = url.split('#')[0];
  const kinds = ALL_SLACK_KINDS.filter((kind) => events.includes(kind));
  return `${base}#events=${kinds.join(',')}`;
}
