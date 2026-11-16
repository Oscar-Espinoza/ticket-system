// Event vocabularies for Slack and outgoing webhooks. Client-safe (the settings
// UI renders these lists), so no imports from events.ts (which pulls in the db).

import { m } from '@/lib/i18n';
import { ISSUE_EVENT } from '@/lib/event-names';

/** Issue event types a webhook can subscribe to. An empty selection = all types. */
export const WEBHOOK_EVENT_TYPES = [
  {
    type: ISSUE_EVENT.created,
    get label() {
      return m.settings_ev_issue_created();
    },
  },
  {
    type: ISSUE_EVENT.updated,
    get label() {
      return m.settings_ev_issue_updated();
    },
  },
  {
    type: ISSUE_EVENT.commentCreated,
    get label() {
      return m.settings_ev_comment_created();
    },
  },
  {
    type: ISSUE_EVENT.commentUpdated,
    get label() {
      return m.settings_ev_comment_edited();
    },
  },
  {
    type: ISSUE_EVENT.commentDeleted,
    get label() {
      return m.settings_ev_comment_deleted();
    },
  },
  {
    type: ISSUE_EVENT.archived,
    get label() {
      return m.settings_ev_issue_archived();
    },
  },
  {
    type: ISSUE_EVENT.unarchived,
    get label() {
      return m.settings_ev_issue_unarchived();
    },
  },
  {
    type: ISSUE_EVENT.deleted,
    get label() {
      return m.settings_ev_issue_trashed();
    },
  },
  {
    type: ISSUE_EVENT.restored,
    get label() {
      return m.settings_ev_issue_restored();
    },
  },
  {
    type: ISSUE_EVENT.purged,
    get label() {
      return m.settings_ev_issue_purged();
    },
  },
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]['type'];

const WEBHOOK_TYPES = new Set<string>(WEBHOOK_EVENT_TYPES.map((e) => e.type));

export function isWebhookEventType(value: unknown): value is WebhookEventType {
  return typeof value === 'string' && WEBHOOK_TYPES.has(value);
}

export const SLACK_EVENTS = [
  {
    kind: 'created',
    get label() {
      return m.settings_ev_issue_created();
    },
  },
  {
    kind: 'completed',
    get label() {
      return m.settings_ev_issue_completed();
    },
  },
  {
    kind: 'canceled',
    get label() {
      return m.settings_ev_issue_canceled();
    },
  },
  {
    kind: 'commented',
    get label() {
      return m.settings_ev_new_comment();
    },
  },
] as const;

export type SlackEventKind = (typeof SLACK_EVENTS)[number]['kind'];

const ALL_SLACK_KINDS = SLACK_EVENTS.map((e) => e.kind) as SlackEventKind[];

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
