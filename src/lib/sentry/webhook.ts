// Sentry internal-integration webhooks → issues. Server-only.
//
// - Issue alerts (`event_alert`) open one triage issue per Sentry issue: the
//   Sentry issue URL is stored as a link attachment, and that attachment is the
//   dedupe key (a user linking a Sentry issue by URL counts too). With the
//   integration's optional auth token the issue's short id and event / user
//   counts are read from Sentry's API (the alert payload doesn't carry them).
//   New-issue webhooks (`issue` created) are ignored on purpose: alert rules
//   decide what deserves an issue.
// - `issue` resolved records "Sentry resolved …" on every linked issue.
//
// The route verified `Sentry-Hook-Signature` with this integration's client
// secret first; everything is scoped to its project.

import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { attachments, projects, tickets, workflowStates } from '@/db/schema';
import { emitIssueEvent } from '@/lib/events';
import { createIssue, DESCRIPTION_MAX, SYSTEM_ACTOR, TITLE_MAX } from '@/lib/issue-service';
import { defaultNewIssueState, firstStateOfType } from '@/lib/workflow';
import { hmacHex, safeEqual } from '@/lib/vcs/secrets';
import type { StateType } from '@/lib/issue-model';

export const SENTRY_EVENT = { resolved: 'sentry.resolved' } as const;

/**
 * Sentry signs `JSON.stringify(body)` — normally the raw body byte for byte;
 * the re-serialized form covers a proxy that reformatted it.
 */
export function verifySentrySignature(raw: string, payload: unknown, signature: string | null, secret: string) {
  if (!signature) return false;
  return (
    safeEqual(signature, hmacHex(raw, secret)) || safeEqual(signature, hmacHex(JSON.stringify(payload), secret))
  );
}

interface SentryIssueInfo {
  id: string;
  shortId: string | null;
  title: string;
  culprit: string | null;
  url: string;
  level: string | null;
  count: string | null;
  userCount: number | null;
  projectName: string | null;
  rule: string | null;
}

const text = (value: unknown, max = 500): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/** `…/issues/<id>/events/<event>/` → `…/issues/<id>/`. */
function issueUrlFrom(url: string | null, id: string): string | null {
  if (!url || !/^https:\/\//.test(url)) return null;
  const match = new RegExp(`/issues/${id}(?=[/?#]|$)`).exec(url);
  return match ? `${url.slice(0, match.index)}/issues/${id}/` : null;
}

async function fromEventAlert(data: Record<string, unknown>, token: string | null): Promise<SentryIssueInfo | null> {
  const event = (data.event ?? {}) as Record<string, unknown>;
  const id = String(event.issue_id ?? '');
  if (!/^\d+$/.test(id)) return null;
  const url = issueUrlFrom(text(event.web_url, 1000), id);
  if (!url) return null;
  const details = token ? await fetchIssue(text(event.issue_url, 1000), id, token) : null;
  if (details) return { ...details, rule: text(data.triggered_rule, 200) };
  return {
    id,
    shortId: null,
    title: text(event.title, TITLE_MAX) ?? 'Sentry issue',
    culprit: text(event.culprit),
    url,
    level: text(event.level, 20),
    count: null,
    userCount: null,
    projectName: null,
    rule: text(data.triggered_rule, 200),
  };
}

function fromIssue(data: Record<string, unknown>): SentryIssueInfo | null {
  const issue = (data.issue ?? {}) as Record<string, unknown>;
  const id = String(issue.id ?? '');
  if (!/^\d+$/.test(id)) return null;
  const url = issueUrlFrom(text(issue.web_url, 1000), id) ?? issueUrlFrom(text(issue.permalink, 1000), id);
  if (!url) return null;
  const project = (issue.project ?? {}) as Record<string, unknown>;
  return {
    id,
    shortId: text(issue.shortId, 100),
    title: text(issue.title, TITLE_MAX) ?? 'Sentry issue',
    culprit: text(issue.culprit),
    url,
    level: text(issue.level, 20),
    count: issue.count == null ? null : String(issue.count).slice(0, 20),
    userCount: typeof issue.userCount === 'number' ? issue.userCount : null,
    projectName: text(project.name ?? project.slug, 100),
    rule: null,
  };
}

/** The issue from Sentry's API (`issue_url` of the signed payload), or null. */
async function fetchIssue(apiUrl: string | null, id: string, token: string): Promise<SentryIssueInfo | null> {
  if (!apiUrl || !/^https:\/\/[^/]+\/api\/0\//.test(apiUrl) || !apiUrl.includes(`/issues/${id}`)) return null;
  try {
    const response = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const issue = (await response.json()) as Record<string, unknown>;
    return fromIssue({ issue: { ...issue, web_url: issue.permalink ?? issue.web_url } });
  } catch (err) {
    console.error('[sentry] issue lookup failed', err);
    return null;
  }
}

/** Live issues of the project linked (by attachment) to Sentry issue `id`. */
async function linkedIssues(projectId: string, id: string) {
  return db
    .selectDistinct({ id: tickets.id, number: tickets.ticketNumber, title: tickets.title })
    .from(attachments)
    .innerJoin(tickets, eq(tickets.id, attachments.ticketId))
    .where(
      and(
        eq(tickets.projectId, projectId),
        isNull(tickets.deletedAt),
        eq(attachments.kind, 'link'),
        sql`${attachments.url} ~ ${`/issues/${id}(/|\\?|#|$)`}`,
        sql`${attachments.url} ~* '(sentry|/organizations/)'`,
      ),
    );
}

function description(info: SentryIssueInfo): string {
  const lines = [
    `**Sentry issue** [${info.shortId ?? info.title}](${info.url})`,
    '',
    info.culprit && `- **Culprit:** \`${info.culprit.replaceAll('`', "'")}\``,
    info.level && `- **Level:** ${info.level}`,
    info.count && `- **Events:** ${info.count}${info.userCount != null ? ` · **Users affected:** ${info.userCount}` : ''}`,
    info.projectName && `- **Sentry project:** ${info.projectName}`,
    info.rule && `- **Alert rule:** ${info.rule}`,
  ].filter((line): line is string => typeof line === 'string');
  return lines.join('\n').slice(0, DESCRIPTION_MAX);
}

async function openTriageIssue(projectId: string, info: SentryIssueInfo) {
  if ((await linkedIssues(projectId, info.id)).length) return;

  const [[project], states] = await Promise.all([
    db.select({ triageEnabled: projects.triageEnabled }).from(projects).where(eq(projects.id, projectId)).limit(1),
    db
      .select({
        id: workflowStates.id,
        name: workflowStates.name,
        type: workflowStates.type,
        color: workflowStates.color,
        position: workflowStates.position,
        description: workflowStates.description,
      })
      .from(workflowStates)
      .where(eq(workflowStates.projectId, projectId)),
  ]);
  if (!project) return;
  const state =
    (project.triageEnabled ? firstStateOfType(states, 'triage' as StateType) : undefined) ??
    defaultNewIssueState(states);

  // Narrow the race with a concurrent delivery for the same Sentry issue.
  if ((await linkedIssues(projectId, info.id)).length) return;
  const created = await createIssue(SYSTEM_ACTOR, projectId, {
    title: info.title,
    description: description(info),
    stateId: state?.id,
  });
  if (!created.ok) {
    console.error(`[sentry] could not create an issue for ${info.id}: ${created.error}`);
    return;
  }
  await db.insert(attachments).values({
    id: crypto.randomUUID(),
    ticketId: created.issue.id,
    uploaderId: null,
    kind: 'link',
    title: `Sentry: ${info.shortId ?? info.title}`.slice(0, 200),
    url: info.url,
    contentType: null,
    size: null,
    createdAt: new Date(),
  });
}

async function recordResolved(projectId: string, ticketKey: string, info: SentryIssueInfo) {
  const linked = await linkedIssues(projectId, info.id);
  if (!linked.length) return;
  const name = info.shortId ?? info.title;
  await emitIssueEvent(
    linked.map((issue) => ({
      projectId,
      ticketId: issue.id,
      actorId: null,
      type: SENTRY_EVENT.resolved,
      data: {
        key: `${ticketKey}-${issue.number}`,
        title: issue.title,
        actorName: 'Sentry',
        summary: `resolved the Sentry issue ${name}`,
        sentry: { id: info.id, url: info.url },
      },
    })),
  );
}

export async function handleSentryWebhook(
  project: { id: string; ticketKey: string },
  resource: string,
  payload: unknown,
  token: string | null,
) {
  const body = (payload ?? {}) as { action?: string; data?: Record<string, unknown> };
  const data = body.data ?? {};
  if (resource === 'event_alert' && body.action === 'triggered') {
    const info = await fromEventAlert(data, token);
    if (info) await openTriageIssue(project.id, info);
  } else if (resource === 'issue' && body.action === 'resolved') {
    const info = fromIssue(data);
    if (info) await recordResolved(project.id, project.ticketKey, info);
  }
}
