// Slack dispatcher — called by emitIssueEvent after the response. Posts the
// project's selected events (see SLACK_EVENTS) to its incoming webhook as ONE
// Block Kit message per project per dispatch, so a bulk edit is one message,
// not fifty. Imports (`data.bulk`) and project-level events (no ticket) are
// never posted. Never throws: Slack being down must not surface anywhere.

import { and, inArray, isNotNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import type { IssueChange, StoredIssueEvent } from '@/lib/events';
import { stripMentions } from '@/lib/mentions';
import { absoluteIssueUrl } from '@/lib/integrations/app-url';
import { commentIdOf, loadEventContext, type EventContext } from '@/lib/integrations/event-context';
import {
  parseSlackSetting,
  SLACK_URL_PREFIX,
  type SlackEventKind,
} from '@/lib/integrations/event-types';

const TIMEOUT_MS = 3000;
const MAX_SECTIONS = 10;
const COMMENT_PREVIEW = 300;

type SlackBlock = Record<string, unknown>;

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
}

/** Slack mrkdwn control characters. */
export function slackEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** POST to an incoming webhook. Resolves to the HTTP status (0 = network error / timeout). */
export async function sendSlackMessage(url: string, message: SlackMessage): Promise<number> {
  if (!url.startsWith(SLACK_URL_PREFIX)) return 0;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.status;
  } catch {
    return 0;
  }
}

function slackKind(event: StoredIssueEvent): SlackEventKind | null {
  if (!event.ticketId || event.data.bulk === true) return null;
  switch (event.type) {
    case 'issue.created':
      return 'created';
    case 'comment.created':
      return 'commented';
    case 'issue.updated': {
      const changes = (event.data.changes ?? []) as IssueChange[];
      const state = changes.find((c) => c.field === 'stateId');
      const type = (state?.to as { type?: string } | null)?.type;
      return type === 'completed' ? 'completed' : type === 'canceled' ? 'canceled' : null;
    }
    default:
      return null;
  }
}

function describe(event: StoredIssueEvent, kind: SlackEventKind, ctx: EventContext): string {
  const issue = event.ticketId ? ctx.issues.get(event.ticketId) : undefined;
  const key = issue?.key ?? String(event.data.key ?? '');
  const title = issue?.title ?? String(event.data.title ?? '');
  const link = key
    ? `*<${absoluteIssueUrl(event.projectId, key)}|${slackEscape(`${key} ${title}`)}>*`
    : `*${slackEscape(title || 'An issue')}*`;
  const actorName = event.actorId ? ctx.actorNames.get(event.actorId) : undefined;
  // No actor = automation or an intake-form submission.
  const actor = slackEscape(actorName ?? 'Automation');
  const state = issue ? slackEscape(issue.state.name) : '';

  switch (kind) {
    case 'created': {
      const who = actorName ? `${actor} created the issue` : 'New issue';
      return `${link}\n${who}${state ? ` · ${state}` : ''}`;
    }
    case 'completed':
      return `${link}\n${actor} marked it ${state || 'done'}`;
    case 'canceled':
      return `${link}\n${actor} moved it to ${state || 'canceled'}`;
    case 'commented': {
      const commentId = commentIdOf(event);
      const excerpt = typeof event.data.excerpt === 'string' ? event.data.excerpt : undefined;
      const body = (commentId && ctx.commentBodies.get(commentId)) || excerpt;
      if (!body) return `${link}\n${actor} commented`;
      const plain = stripMentions(body).trim();
      const preview = plain.length > COMMENT_PREVIEW ? `${plain.slice(0, COMMENT_PREVIEW)}…` : plain;
      const quoted = slackEscape(preview)
        .split('\n')
        .map((line) => `>${line}`)
        .join('\n');
      return `${link}\n${actor} commented:\n${quoted}`;
    }
  }
}

function buildMessage(
  projectName: string,
  items: { event: StoredIssueEvent; kind: SlackEventKind }[],
  ctx: EventContext,
): SlackMessage {
  const texts = items.slice(0, MAX_SECTIONS).map(({ event, kind }) => describe(event, kind, ctx));
  const blocks: SlackBlock[] = texts.map((text) => ({
    type: 'section',
    text: { type: 'mrkdwn', text },
  }));
  const extra = items.length - texts.length;
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: slackEscape(extra > 0 ? `${projectName} · and ${extra} more` : projectName),
      },
    ],
  });
  // `text` is the notification / fallback line; strip the link markup.
  const fallback = texts[0].split('\n')[0].replace(/^\*<[^|]*\|(.*)>\*$/, '$1');
  return { text: items.length > 1 ? `${fallback} (+${items.length - 1})` : fallback, blocks };
}

async function run(all: StoredIssueEvent[]) {
  // Classify first: most batches (edits, project-level events) post nothing,
  // and then there is no need to look up the projects' Slack settings at all.
  const kinds = all.flatMap((event) => {
    const kind = slackKind(event);
    return kind ? [{ event, kind }] : [];
  });
  if (kinds.length === 0) return;
  const projectIds = [...new Set(kinds.map(({ event }) => event.projectId))];
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      slackWebhookUrl: projects.slackWebhookUrl,
      slackEvents: projects.slackEvents,
    })
    .from(projects)
    .where(and(inArray(projects.id, projectIds), isNotNull(projects.slackWebhookUrl)));
  if (rows.length === 0) return;

  const targets = new Map(
    rows.flatMap((row) => {
      const setting = parseSlackSetting(row.slackWebhookUrl, row.slackEvents);
      return setting ? [[row.id, { name: row.name, ...setting }] as const] : [];
    }),
  );

  const selected = kinds.filter(({ event, kind }) =>
    targets.get(event.projectId)?.events.includes(kind),
  );
  if (selected.length === 0) return;

  const ctx = await loadEventContext(selected.map((s) => s.event));
  await Promise.all(
    [...targets].map(async ([projectId, target]) => {
      const items = selected.filter((s) => s.event.projectId === projectId);
      if (items.length === 0) return;
      const status = await sendSlackMessage(target.url, buildMessage(target.name, items, ctx));
      if (status < 200 || status >= 300) {
        console.error(`[slack] delivery for project ${projectId} failed (status ${status})`);
      }
    }),
  );
}

export async function postToSlack(events: StoredIssueEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    await run(events);
  } catch (err) {
    console.error('[slack] dispatch failed', err);
  }
}
