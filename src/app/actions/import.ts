'use server';

// Issue import (CSV, Jira CSV, GitHub Issues, Asana, Shortcut). The client
// parses / fetches records and sends them here in chunks; everything is
// re-validated against the project before issue-service.createIssue writes it.
// Created issues land in activity like any other, but with `source: 'import'`
// so Slack, outgoing webhooks and notifications skip them (no flood per row).
// Asana / Shortcut tokens are passed per call and never stored.

import { revalidatePath } from 'next/cache';
import { and, eq, or, sql } from 'drizzle-orm';
import { Octokit } from '@octokit/rest';

import { db } from '@/lib/db';
import { labels, projectMembers, projects, tickets, users, workflowStates } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { getGitHubToken } from '@/lib/github-token';
import { isDateString } from '@/lib/dates';
import { estimateOptions } from '@/lib/estimates';
import { isPriority, type StateType, type WorkflowState } from '@/lib/issue-model';
import { createIssue, DESCRIPTION_MAX, TITLE_MAX } from '@/lib/issue-service';
import { defaultNewIssueState, firstStateOfType } from '@/lib/workflow';
import {
  GITHUB_IMPORT_CAP,
  IMPORT_CHUNK,
  isImportSourceKind,
  sourceFooter,
  sourceMarker,
  type ImportChunkResult,
  type ImportLabel,
  type ImportRecord,
  type ImportSource,
} from '@/lib/import/records';
import { fetchAsanaTasks, listAsanaProjects, listAsanaWorkspaces, type AsanaOption } from '@/lib/import/asana';
import { describeImportError, type ExternalFetchResult } from '@/lib/import/external';
import { fetchShortcutStories, listShortcutSources, type ShortcutOption } from '@/lib/import/shortcut';
import { VcsHttpError } from '@/lib/vcs/http';

type Fail = { ok: false; error: string };

const LABEL_NAME_MAX = 40;
const COLOR_RE = /^#[0-9a-f]{6}$/;
const LABEL_COLORS = ['#5e6ad2', '#26b5ce', '#4cb782', '#f2c94c', '#f2994a', '#eb5757', '#bb87fc', '#95a2b3'];
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// ---------------------------------------------------------------------------
// Untrusted input → ImportRecord
// ---------------------------------------------------------------------------

const str = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

function readSource(value: unknown): ImportSource | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;
  const id = str(raw.id, 200);
  if (!isImportSourceKind(kind) || !id) return null;
  const url = str(raw.url, 500);
  return {
    kind,
    id,
    url: url && /^https?:\/\//.test(url) ? url : null,
    createdAt: str(raw.createdAt, 40),
  };
}

function readLabels(value: unknown): ImportLabel[] {
  if (!Array.isArray(value)) return [];
  const out = new Map<string, ImportLabel>();
  for (const item of value.slice(0, 50)) {
    const name = str((item as ImportLabel)?.name, LABEL_NAME_MAX);
    if (!name) continue;
    const color = str((item as ImportLabel)?.color, 7)?.toLowerCase();
    out.set(name.toLowerCase(), { name, color: color && COLOR_RE.test(color) ? color : null });
  }
  return [...out.values()];
}

function readRecord(value: unknown): ImportRecord | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const title = str(raw.title, TITLE_MAX);
  if (!title) return null;
  return {
    title,
    description: str(raw.description, DESCRIPTION_MAX),
    state: str(raw.state, 100),
    closed: raw.closed === true,
    priority: isPriority(raw.priority) ? raw.priority : null,
    assignee: str(raw.assignee, 320),
    labels: readLabels(raw.labels),
    estimate: typeof raw.estimate === 'number' && Number.isFinite(raw.estimate) ? raw.estimate : null,
    dueDate: isDateString(raw.dueDate) ? raw.dueDate : null,
    source: readSource(raw.source),
    parent: readSource(raw.parent),
  };
}

// ---------------------------------------------------------------------------
// Resolution against the project
// ---------------------------------------------------------------------------

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

// Common tracker status names → our state types, for names the project lacks.
const STATUS_TYPES: Record<string, StateType> = {
  triage: 'triage',
  new: 'triage',
  backlog: 'backlog',
  icebox: 'backlog',
  open: 'unstarted',
  todo: 'unstarted',
  selectedfordevelopment: 'unstarted',
  ready: 'unstarted',
  inprogress: 'started',
  started: 'started',
  doing: 'started',
  inreview: 'started',
  review: 'started',
  codereview: 'started',
  qa: 'started',
  testing: 'started',
  done: 'completed',
  closed: 'completed',
  resolved: 'completed',
  complete: 'completed',
  completed: 'completed',
  fixed: 'completed',
  canceled: 'canceled',
  cancelled: 'canceled',
  wontdo: 'canceled',
  wontfix: 'canceled',
  duplicate: 'canceled',
  rejected: 'canceled',
};

function resolveState(states: WorkflowState[], record: ImportRecord): WorkflowState | undefined {
  if (record.state) {
    const wanted = key(record.state);
    const byName = states.find((s) => key(s.name) === wanted);
    if (byName) return byName;
    const type = STATUS_TYPES[wanted];
    const byType = type && firstStateOfType(states, type);
    if (byType) return byType;
  }
  if (record.closed) return firstStateOfType(states, 'completed') ?? defaultNewIssueState(states);
  return defaultNewIssueState(states);
}

/** Nearest value on the project's scale (ties round up); null when estimates are off. */
function snapEstimate(scale: string, value: number | null): number | null {
  const options = estimateOptions(scale);
  if (value === null || options.length === 0) return null;
  return options.reduce((best, o) =>
    Math.abs(o.value - value) <= Math.abs(best.value - value) ? o : best,
  ).value;
}

function withFooter(description: string | null, source: ImportSource | null): string | null {
  if (!source) return description;
  const footer = sourceFooter(source);
  const room = DESCRIPTION_MAX - footer.length - 20;
  const body = description && description.length > room ? `${description.slice(0, room)}…` : description;
  return body ? `${body}\n\n---\n${footer}` : footer;
}

// ---------------------------------------------------------------------------
// importIssues
// ---------------------------------------------------------------------------

export async function importIssues(input: {
  projectId: string;
  records: unknown[];
}): Promise<({ ok: true } & ImportChunkResult) | Fail> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const { projectId } = input;
  if (!Array.isArray(input.records) || input.records.length > IMPORT_CHUNK) {
    return { ok: false, error: `Send at most ${IMPORT_CHUNK} issues at a time.` };
  }
  const records = input.records.map(readRecord);

  const [projectRows, stateRows, labelRows, memberRows] = await db.batch([
    db
      .select({ estimateScale: projects.estimateScale })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
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
    db
      .select({ id: labels.id, name: labels.name })
      .from(labels)
      .where(eq(labels.projectId, projectId)),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, projectId)),
  ]);
  const project = projectRows[0];
  if (!project) return { ok: false, error: 'Project not found.' };

  // Labels: reuse by case-insensitive name, create the missing ones in one insert.
  const labelIds = new Map(labelRows.map((l) => [l.name.toLowerCase(), l.id]));
  const missing = new Map<string, ImportLabel>();
  for (const record of records) {
    for (const label of record?.labels ?? []) {
      const k = label.name.toLowerCase();
      if (!labelIds.has(k) && !missing.has(k)) missing.set(k, label);
    }
  }
  if (missing.size) {
    const now = new Date();
    await db
      .insert(labels)
      .values(
        [...missing.values()].map((label, i) => ({
          id: crypto.randomUUID(),
          projectId,
          name: label.name,
          color: label.color ?? LABEL_COLORS[(labelIds.size + i) % LABEL_COLORS.length],
          createdAt: now,
        })),
      )
      .onConflictDoNothing();
    // Re-read so labels a concurrent writer just created resolve too.
    const fresh = await db
      .select({ id: labels.id, name: labels.name })
      .from(labels)
      .where(eq(labels.projectId, projectId));
    for (const l of fresh) labelIds.set(l.name.toLowerCase(), l.id);
  }

  // Duplicates: the source footer is the marker (trash included — restore instead).
  // Parent markers resolve sub-issues to issues imported in earlier chunks.
  const markers = records.flatMap((r) => (r?.source ? [sourceMarker(r.source)] : []));
  const parentMarkers = records.flatMap((r) => (r?.parent ? [sourceMarker(r.parent)] : []));
  const lookup = [...new Set([...markers, ...parentMarkers])];
  const existing = lookup.length
    ? await db
        .select({ id: tickets.id, description: tickets.description, deletedAt: tickets.deletedAt })
        .from(tickets)
        .where(
          and(
            eq(tickets.projectId, projectId),
            or(...lookup.map((m) => sql`position(${m} in ${tickets.description}) > 0`)),
          ),
        )
    : [];
  const seen = new Set(
    markers.filter((m) => existing.some((row) => row.description?.includes(m))),
  );
  /** Marker → live issue id, for parents (grows as this chunk creates issues). */
  const issueByMarker = new Map<string, string>();
  for (const m of parentMarkers) {
    const row = existing.find((r) => !r.deletedAt && r.description?.includes(m));
    if (row) issueByMarker.set(m, row.id);
  }

  const byEmail = new Map(memberRows.map((m) => [m.email.toLowerCase(), m.id]));
  const byName = new Map<string, string | null>();
  for (const m of memberRows) {
    const k = m.name.trim().toLowerCase();
    byName.set(k, byName.has(k) ? null : m.id); // ambiguous names don't match
  }

  const result: ImportChunkResult = { created: 0, duplicates: 0, failed: [] };
  for (const [index, record] of records.entries()) {
    if (!record) {
      result.failed.push({ index, title: '', error: 'Missing title.' });
      continue;
    }
    if (record.source) {
      const marker = sourceMarker(record.source);
      if (seen.has(marker)) {
        result.duplicates++;
        continue;
      }
      seen.add(marker);
    }
    const who = record.assignee?.toLowerCase();
    const state = resolveState(stateRows, record);
    const parentId = record.parent ? issueByMarker.get(sourceMarker(record.parent)) : undefined;
    try {
      const created = await createIssue(
        { userId: authz.userId },
        projectId,
        {
          title: record.title,
          description: withFooter(record.description, record.source),
          stateId: state?.id,
          priority: record.priority ?? 'none',
          assigneeId: (who && (byEmail.get(who) ?? byName.get(who))) || null,
          labelIds: record.labels.flatMap((l) => labelIds.get(l.name.toLowerCase()) ?? []),
          estimate: snapEstimate(project.estimateScale, record.estimate),
          dueDate: record.dueDate,
          ...(parentId ? { parentId } : {}),
        },
        { source: 'import' },
      );
      if (created.ok) {
        result.created++;
        if (record.source) issueByMarker.set(sourceMarker(record.source), created.issue.id);
      } else {
        result.failed.push({ index, title: record.title, error: created.error });
      }
    } catch (err) {
      console.error('[import] create failed', err);
      result.failed.push({ index, title: record.title, error: 'Could not create the issue.' });
    }
  }

  if (result.created || missing.size) {
    revalidatePath(`/dashboard/projects/${projectId}`, 'layout');
  }
  return { ok: true, ...result };
}

// ---------------------------------------------------------------------------
// GitHub Issues
// ---------------------------------------------------------------------------

type GitHubFail = Fail & { reason?: 'no-token' };

async function githubClient(projectId: unknown): Promise<{ ok: true; octokit: Octokit } | GitHubFail> {
  const authz = await authorizeProjectAction(projectId, 'write');
  if (!authz.ok) return authz;
  const token = await getGitHubToken(authz.userId);
  if (!token) {
    return { ok: false, reason: 'no-token', error: 'Connect your GitHub account first.' };
  }
  return { ok: true, octokit: new Octokit({ auth: token }) };
}

function githubError(err: unknown): Fail {
  const status = (err as { status?: number })?.status;
  if (status === 404) {
    return {
      ok: false,
      error: 'Repository not found. Check the name, and that your GitHub login grants the repo scope.',
    };
  }
  if (status === 401) return { ok: false, error: 'GitHub rejected your token. Reconnect GitHub.' };
  if (status === 403) return { ok: false, error: 'GitHub refused the request (rate limit or access).' };
  console.error('[import] github failed', err);
  return { ok: false, error: 'Could not reach GitHub.' };
}

export async function listGitHubRepos(
  projectId: string,
): Promise<{ ok: true; repos: string[]; defaultRepo: string | null } | GitHubFail> {
  const client = await githubClient(projectId);
  if (!client.ok) return client;
  try {
    const [{ data }, [project]] = await Promise.all([
      client.octokit.rest.repos.listForAuthenticatedUser({ per_page: 100, sort: 'updated' }),
      db
        .select({ githubRepo: projects.githubRepo })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1),
    ]);
    return {
      ok: true,
      repos: data.map((r) => r.full_name),
      defaultRepo: project?.githubRepo ?? null,
    };
  } catch (err) {
    return githubError(err);
  }
}

export interface GitHubFetchResult {
  ok: true;
  records: ImportRecord[];
  open: number;
  closed: number;
  /** More issues exist than GITHUB_IMPORT_CAP. */
  truncated: boolean;
}

export async function fetchGitHubIssues(input: {
  projectId: string;
  repo: string;
  includeClosed: boolean;
}): Promise<GitHubFetchResult | GitHubFail> {
  const repo = typeof input?.repo === 'string' ? input.repo.trim() : '';
  if (!REPO_RE.test(repo)) return { ok: false, error: 'Use the owner/name form, e.g. vercel/next.js.' };
  const client = await githubClient(input.projectId);
  if (!client.ok) return client;
  const [owner, name] = repo.split('/');

  const records: ImportRecord[] = [];
  let truncated = false;
  try {
    const pages = client.octokit.paginate.iterator(client.octokit.rest.issues.listForRepo, {
      owner,
      repo: name,
      state: input.includeClosed ? 'all' : 'open',
      sort: 'created',
      direction: 'asc',
      per_page: 100,
    });
    outer: for await (const page of pages) {
      for (const issue of page.data) {
        if (issue.pull_request) continue; // the issues API lists PRs too
        if (records.length >= GITHUB_IMPORT_CAP) {
          truncated = true;
          break outer;
        }
        const body = issue.body?.trim() ?? '';
        records.push({
          title: issue.title.slice(0, TITLE_MAX),
          description: body ? body.slice(0, DESCRIPTION_MAX - 500) : null,
          state: null,
          closed: issue.state === 'closed',
          priority: null,
          assignee: null,
          labels: issue.labels.flatMap((l) => {
            const label = typeof l === 'string' ? { name: l } : l;
            if (!label.name) return [];
            return [{ name: label.name.slice(0, LABEL_NAME_MAX), color: label.color ? `#${label.color}` : null }];
          }),
          estimate: null,
          dueDate: null,
          source: {
            kind: 'github',
            id: `${repo}#${issue.number}`,
            url: issue.html_url,
            createdAt: issue.created_at.slice(0, 10),
          },
        });
      }
    }
  } catch (err) {
    return githubError(err);
  }
  const closed = records.filter((r) => r.closed).length;
  return { ok: true, records, open: records.length - closed, closed, truncated };
}

// ---------------------------------------------------------------------------
// Asana / Shortcut (token per call, never stored)
// ---------------------------------------------------------------------------

type ExternalFail = Fail;

const TOKEN_MAX = 500;

function readToken(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && value.length <= TOKEN_MAX ? value.trim() : null;
}

function externalError(provider: string, err: unknown): ExternalFail {
  if (err instanceof VcsHttpError) {
    if (err.status >= 500 || err.status === 0) console.error(`[import] ${provider} failed`, err);
    return { ok: false, error: describeImportError(provider, err.status, err.message) };
  }
  console.error(`[import] ${provider} failed`, err);
  return { ok: false, error: `Could not reach ${provider}.` };
}

/** Write access to the project plus a token; the token only authenticates upstream. */
async function external(projectId: unknown, token: unknown): Promise<{ ok: true; token: string } | ExternalFail> {
  const authz = await authorizeProjectAction(projectId, 'write');
  if (!authz.ok) return authz;
  const value = readToken(token);
  if (!value) return { ok: false, error: 'Enter a personal access token.' };
  return { ok: true, token: value };
}

const GID_RE = /^\d{1,30}$/;

export async function listAsanaWorkspacesAction(input: {
  projectId: string;
  token: string;
}): Promise<{ ok: true; workspaces: AsanaOption[] } | ExternalFail> {
  const auth = await external(input?.projectId, input?.token);
  if (!auth.ok) return auth;
  try {
    return { ok: true, workspaces: await listAsanaWorkspaces(auth.token) };
  } catch (err) {
    return externalError('Asana', err);
  }
}

export async function listAsanaProjectsAction(input: {
  projectId: string;
  token: string;
  workspace: string;
}): Promise<{ ok: true; projects: AsanaOption[] } | ExternalFail> {
  const auth = await external(input?.projectId, input?.token);
  if (!auth.ok) return auth;
  if (typeof input.workspace !== 'string' || !GID_RE.test(input.workspace)) {
    return { ok: false, error: 'Pick a workspace.' };
  }
  try {
    return { ok: true, projects: await listAsanaProjects(auth.token, input.workspace) };
  } catch (err) {
    return externalError('Asana', err);
  }
}

export async function fetchAsanaTasksAction(input: {
  projectId: string;
  token: string;
  project: string;
  includeCompleted: boolean;
}): Promise<({ ok: true } & ExternalFetchResult) | ExternalFail> {
  const auth = await external(input?.projectId, input?.token);
  if (!auth.ok) return auth;
  if (typeof input.project !== 'string' || !GID_RE.test(input.project)) {
    return { ok: false, error: 'Pick a project.' };
  }
  try {
    return { ok: true, ...(await fetchAsanaTasks(auth.token, input.project, input.includeCompleted === true)) };
  } catch (err) {
    return externalError('Asana', err);
  }
}

export async function listShortcutSourcesAction(input: {
  projectId: string;
  token: string;
}): Promise<{ ok: true; workflows: ShortcutOption[]; projects: ShortcutOption[] } | ExternalFail> {
  const auth = await external(input?.projectId, input?.token);
  if (!auth.ok) return auth;
  try {
    return { ok: true, ...(await listShortcutSources(auth.token)) };
  } catch (err) {
    return externalError('Shortcut', err);
  }
}

export async function fetchShortcutStoriesAction(input: {
  projectId: string;
  token: string;
  source: { kind: 'workflow' | 'project'; id: number };
  includeCompleted: boolean;
}): Promise<({ ok: true } & ExternalFetchResult) | ExternalFail> {
  const auth = await external(input?.projectId, input?.token);
  if (!auth.ok) return auth;
  const source = input.source;
  if (
    !source ||
    (source.kind !== 'workflow' && source.kind !== 'project') ||
    !Number.isSafeInteger(source.id) ||
    source.id <= 0
  ) {
    return { ok: false, error: 'Pick a workflow or project.' };
  }
  try {
    return {
      ok: true,
      ...(await fetchShortcutStories(auth.token, { kind: source.kind, id: source.id }, input.includeCompleted === true)),
    };
  } catch (err) {
    return externalError('Shortcut', err);
  }
}
