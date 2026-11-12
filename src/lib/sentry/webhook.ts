// Sentry internal-integration webhooks → issues. Server-only.
//
// - Issue alerts (`event_alert`) open one triage issue per Sentry issue: the
//   Sentry issue URL is stored as a link attachment, and that attachment is the
//   dedupe key (a user linking a Sentry issue by URL counts too). The issue and
//   its link commit together, and the issue's id is derived from the Sentry
//   issue, so two alerts at once (or a retry) create it once. With the
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
import { attachments, projects, tickets } from '@/db/schema';
import { projectStatesQuery } from '@/lib/workflow-server';
import { emitIssueEvent, ISSUE_EVENT } from '@/lib/events';
import { createIssue, DESCRIPTION_MAX, SYSTEM_ACTOR, TITLE_MAX } from '@/lib/issue-service';
import { defaultNewIssueState, firstStateOfType } from '@/lib/workflow';
import { derivedUuid, verifyHmac } from '@/lib/server/secrets';
import type { StateType } from '@/lib/issue-model';
import { guardedRequest } from '@/lib/integrations/url-guard';
import { WEBHOOK_TIMEOUT_MS } from '@/lib/integrations/timeouts';
import { clippedText } from '@/lib/text';
import { formatIssueKey } from '@/lib/tickets';

/**
 * Sentry signs `JSON.stringify(body)` — normally the raw body byte for byte;
 * the re-serialized form covers a proxy that reformatted it.
 */
export function verifySentrySignature(raw: string, payload: unknown, signature: string | null, secret: string) {
  return verifyHmac(signature, raw, secret) || verifyHmac(signature, JSON.stringify(payload), secret);
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
  const url = issueUrlFrom(clippedText(event.web_url, 1000), id);
  if (!url) return null;
  const details = token ? await fetchIssue(clippedText(event.issue_url, 1000), id, token) : null;
  if (details) return { ...details, rule: clippedText(data.triggered_rule, 200) };
  return {
    id,
    shortId: null,
    title: clippedText(event.title, TITLE_MAX) ?? 'Sentry issue',
    culprit: clippedText(event.culprit, 500),
    url,
    level: clippedText(event.level, 20),
    count: null,
    userCount: null,
    projectName: null,
    rule: clippedText(data.triggered_rule, 200),
  };
}

function fromIssue(data: Record<string, unknown>): SentryIssueInfo | null {
  const issue = (data.issue ?? {}) as Record<string, unknown>;
  const id = String(issue.id ?? '');
  if (!/^\d+$/.test(id)) return null;
  const url = issueUrlFrom(clippedText(issue.web_url, 1000), id) ?? issueUrlFrom(clippedText(issue.permalink, 1000), id);
  if (!url) return null;
  const project = (issue.project ?? {}) as Record<string, unknown>;
  return {
    id,
    shortId: clippedText(issue.shortId, 100),
    title: clippedText(issue.title, TITLE_MAX) ?? 'Sentry issue',
    culprit: clippedText(issue.culprit, 500),
    url,
    level: clippedText(issue.level, 20),
    count: issue.count == null ? null : String(issue.count).slice(0, 20),
    userCount: typeof issue.userCount === 'number' ? issue.userCount : null,
    projectName: clippedText(project.name ?? project.slug, 100),
    rule: null,
  };
}

/** The issue from Sentry's API (`issue_url` of the signed payload), or null. */
async function fetchIssue(apiUrl: string | null, id: string, token: string): Promise<SentryIssueInfo | null> {
  if (!apiUrl || !/^https:\/\/[^/]+\/api\/0\//.test(apiUrl) || !apiUrl.includes(`/issues/${id}`)) return null;
  try {
    // The host comes from the payload (self-hosted Sentry): same SSRF guard as webhooks.
    const response = await guardedRequest(apiUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      timeoutMs: WEBHOOK_TIMEOUT_MS,
      maxBytes: 2 * 1024 * 1024,
    });
    if (response.status < 200 || response.status >= 300) return null;
    const issue = JSON.parse(response.body) as Record<string, unknown>;
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

/** The triage issue's id for Sentry issue `sentryId` in a project (same for every alert). */
export function triageIssueId(projectId: string, sentryId: string): string {
  return derivedUuid(`sentry:${projectId}:${sentryId}`, 'Sentry triage issues');
}

async function openTriageIssue(projectId: string, info: SentryIssueInfo) {
  if ((await linkedIssues(projectId, info.id)).length) return;

  const [[project], states] = await Promise.all([
    db.select({ triageEnabled: projects.triageEnabled }).from(projects).where(eq(projects.id, projectId)).limit(1),
    projectStatesQuery(projectId),
  ]);
  if (!project) return;
  const state =
    (project.triageEnabled ? firstStateOfType(states, 'triage' as StateType) : undefined) ??
    defaultNewIssueState(states);

  const input = { title: info.title, description: description(info), stateId: state?.id };
  const withRows = (ticketId: string) => [
    db.insert(attachments).values({
      id: crypto.randomUUID(),
      ticketId,
      uploaderId: null,
      kind: 'link',
      title: `Sentry: ${info.shortId ?? info.title}`.slice(0, 200),
      url: info.url,
      contentType: null,
      size: null,
      createdAt: new Date(),
    }),
  ];
  // A concurrent alert that won the create returns its issue (a replay).
  let created = await createIssue(SYSTEM_ACTOR, projectId, input, { id: triageIssueId(projectId, info.id), withRows });
  // The derived id is taken by an issue that no longer answers for this
  // project — trashed, or moved away with its link: open a fresh one, as
  // before ids were derived.
  if (!created.ok || created.issue.deletedAt) {
    created = await createIssue(SYSTEM_ACTOR, projectId, input, { withRows });
  }
  if (!created.ok) console.error(`[sentry] could not create an issue for ${info.id}: ${created.error}`);
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
      type: ISSUE_EVENT.sentryResolved,
      data: {
        key: formatIssueKey(ticketKey, issue.number),
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
