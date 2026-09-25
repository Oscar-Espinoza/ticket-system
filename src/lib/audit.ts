// Audit log (D12): the read side over `activity` for the project / workspace
// audit pages and the export route, plus writers for security events (2FA,
// SSO, SCIM, exports) that have no issue to hang on.
//
// Storage: activity.projectId is NOT NULL, so a workspace-level event is stored
// once on the workspace's oldest project with data.scope = 'workspace' and
// data.workspaceId; every project of that workspace (and the workspace view)
// includes it. Security events are inserted directly — no notification /
// Slack / webhook fan-out.
//
// Server-only. Imported by src/lib/auth.ts, so it must never import auth.ts
// or session.ts (cycle): callers pass the viewer's user id.

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lt,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import {
  activities,
  projectMembers,
  projects,
  tickets,
  users,
  workspaceMembers,
  workspaces,
} from '@/db/schema';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const AUDIT_CATEGORIES = [
  'issues',
  'comments',
  'planning',
  'members',
  'settings',
  'security',
  'integrations',
  'other',
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_CATEGORY_LABEL: Record<AuditCategory, string> = {
  issues: 'Issues',
  comments: 'Comments',
  planning: 'Epics & planning',
  members: 'Members & roles',
  settings: 'Team settings',
  security: 'Security',
  integrations: 'Integrations',
  other: 'Other',
};

const CATEGORY_PREFIXES: Record<Exclude<AuditCategory, 'other'>, string[]> = {
  issues: ['issue.', 'relation.', 'attachment.', 'triage.', 'customer.', 'recurring.'],
  comments: ['comment.', 'reaction.'],
  planning: ['epic.', 'epic_label.', 'cycle.', 'milestone.', 'initiative.', 'document.'],
  members: ['member.', 'workspace.'],
  settings: ['project.', 'label.', 'workflow.', 'template.'],
  security: ['security.'],
  integrations: ['github.', 'gitlab.', 'bitbucket.', 'sentry.', 'webhook.', 'slack.', 'intake.', 'import.'],
};

export const isAuditCategory = (value: unknown): value is AuditCategory =>
  (AUDIT_CATEGORIES as readonly unknown[]).includes(value);

export function auditCategory(type: string): AuditCategory {
  for (const [category, prefixes] of Object.entries(CATEGORY_PREFIXES)) {
    if (prefixes.some((prefix) => type.startsWith(prefix))) return category as AuditCategory;
  }
  return 'other';
}

function categoryCondition(category: AuditCategory): SQL | undefined {
  const matches = (prefixes: string[]) =>
    or(...prefixes.map((prefix) => like(activities.type, `${prefix.replace(/_/g, '\\_')}%`)));
  if (category !== 'other') return matches(CATEGORY_PREFIXES[category]);
  const any = matches(Object.values(CATEGORY_PREFIXES).flat());
  return any ? not(any) : undefined;
}

// ---------------------------------------------------------------------------
// Filters (URL-driven; invalid values are dropped, never rejected)
// ---------------------------------------------------------------------------

/** Actor filter value for events without a user (integrations, automations). */
export const AUDIT_SYSTEM_ACTOR = 'system';

export interface AuditFilters {
  /** A user id or AUDIT_SYSTEM_ACTOR. */
  actor: string | null;
  category: AuditCategory | null;
  /** YYYY-MM-DD, inclusive (UTC). */
  from: string | null;
  to: string | null;
  /** Issue key, e.g. "APP-12" (upper-cased). */
  issue: string | null;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  actor: null,
  category: null,
  from: null,
  to: null,
  issue: null,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISSUE_KEY_RE = /^([A-Z][A-Z0-9]{0,9})-(\d{1,9})$/;

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function param(source: ParamSource, name: string): string | null {
  const value = source instanceof URLSearchParams ? source.get(name) : source[name];
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof first === 'string' ? first.trim() : '';
  return trimmed || null;
}

const validDate = (value: string | null) =>
  value && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null;

export function parseAuditFilters(source: ParamSource): AuditFilters {
  const actor = param(source, 'actor');
  const category = param(source, 'category');
  const issue = param(source, 'issue')?.toUpperCase() ?? null;
  return {
    actor: actor && actor.length <= 128 ? actor : null,
    category: isAuditCategory(category) ? category : null,
    from: validDate(param(source, 'from')),
    to: validDate(param(source, 'to')),
    issue: issue && ISSUE_KEY_RE.test(issue) ? issue : null,
  };
}

/** Filters → query string entries (only the set ones). */
export function auditFilterParams(filters: AuditFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter((entry): entry is [string, string] => !!entry[1]),
  );
}

// ---------------------------------------------------------------------------
// Scope + authorization
// ---------------------------------------------------------------------------

export type AuditScope =
  | {
      kind: 'project';
      id: string;
      name: string;
      ticketKey: string;
      workspaceId: string | null;
    }
  | {
      kind: 'workspace';
      id: string;
      slug: string;
      name: string;
      /** Projects of the workspace the viewer administers (their issue events are included). */
      adminProjectIds: string[];
    };

const ADMIN_ROLES = ['owner', 'admin'] as const;

/**
 * The audit scope when `userId` may read it, else null (callers 404):
 * project owner/admin for a project, workspace owner/admin for a workspace
 * (by id or slug).
 */
export async function resolveAuditScope(
  kind: unknown,
  id: unknown,
  userId: string,
): Promise<AuditScope | null> {
  if (typeof id !== 'string' || !id || id.length > 128 || !userId) return null;

  if (kind === 'project') {
    const [row] = await db
      .select({
        id: projects.id,
        name: projects.name,
        ticketKey: projects.ticketKey,
        workspaceId: projects.workspaceId,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(and(eq(projectMembers.projectId, id), eq(projectMembers.userId, userId)))
      .limit(1);
    if (!row || !(ADMIN_ROLES as readonly string[]).includes(row.role)) return null;
    return {
      kind: 'project',
      id: row.id,
      name: row.name,
      ticketKey: row.ticketKey,
      workspaceId: row.workspaceId,
    };
  }

  if (kind === 'workspace') {
    const [row] = await db
      .select({
        id: workspaces.id,
        slug: workspaces.slug,
        name: workspaces.name,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(
        and(
          or(eq(workspaces.id, id), eq(workspaces.slug, id)),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!row || row.role === 'member') return null;
    const adminProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .innerJoin(
        projectMembers,
        and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)),
      )
      .where(and(eq(projects.workspaceId, row.id), inArray(projectMembers.role, [...ADMIN_ROLES])));
    return {
      kind: 'workspace',
      id: row.id,
      slug: row.slug,
      name: row.name,
      adminProjectIds: adminProjects.map((p) => p.id),
    };
  }

  return null;
}

const workspaceEvent = (workspaceId: string) =>
  and(
    sql`${activities.data}->>'scope' = 'workspace'`,
    sql`${activities.data}->>'workspaceId' = ${workspaceId}`,
  );

function scopeCondition(scope: AuditScope): SQL | undefined {
  if (scope.kind === 'project') {
    if (!scope.workspaceId) return eq(activities.projectId, scope.id);
    // The projectId IN (…) prefix keeps the activity_project_idx usable.
    const inWorkspace = db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.workspaceId, scope.workspaceId));
    return and(
      inArray(activities.projectId, inWorkspace),
      or(eq(activities.projectId, scope.id), workspaceEvent(scope.workspaceId)),
    );
  }
  const inWorkspace = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.workspaceId, scope.id));
  return and(
    inArray(activities.projectId, inWorkspace),
    or(
      workspaceEvent(scope.id),
      scope.adminProjectIds.length > 0
        ? and(
            inArray(activities.projectId, scope.adminProjectIds),
            sql`coalesce(${activities.data}->>'scope', '') <> 'workspace'`,
          )
        : undefined,
    ),
  );
}

/** The WHERE clause for a scope + filters. */
export async function auditConditions(scope: AuditScope, filters: AuditFilters): Promise<SQL | undefined> {
  const parts: (SQL | undefined)[] = [scopeCondition(scope)];

  if (filters.actor === AUDIT_SYSTEM_ACTOR) parts.push(isNull(activities.actorId));
  else if (filters.actor) parts.push(eq(activities.actorId, filters.actor));

  if (filters.category) parts.push(categoryCondition(filters.category));
  if (filters.from) parts.push(gte(activities.createdAt, new Date(`${filters.from}T00:00:00Z`)));
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    parts.push(lt(activities.createdAt, end));
  }

  if (filters.issue) {
    // Purged issues keep their key in data; live ones match by id (keys can change on move).
    const [, key, number] = ISSUE_KEY_RE.exec(filters.issue) ?? [];
    const [ticket] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .innerJoin(projects, eq(tickets.projectId, projects.id))
      .where(and(eq(projects.ticketKey, key), eq(tickets.ticketNumber, Number(number))))
      .limit(1);
    const byKey = sql`${activities.data}->>'key' = ${filters.issue}`;
    parts.push(ticket ? or(eq(activities.ticketId, ticket.id), byKey) : byKey);
  }

  return and(...parts);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface AuditRow {
  id: string;
  createdAt: Date;
  type: string;
  category: AuditCategory;
  summary: string;
  /** null = system / integration, or a deleted account. */
  actor: { id: string; name: string; email: string; image: string | null } | null;
  project: { id: string; name: string; key: string };
  /** `projectId` is the issue's current team (issues can move); null once purged. */
  issue: { key: string; title: string | null; projectId: string | null } | null;
  data: Record<string, unknown>;
}

export interface AuditCursor {
  createdAt: Date;
  id: string;
}

export const encodeAuditCursor = (row: { createdAt: Date; id: string }) =>
  `${row.createdAt.getTime()}_${row.id}`;

export function decodeAuditCursor(value: unknown): AuditCursor | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,15})_([\w-]{1,128})$/.exec(value);
  if (!match) return null;
  return { createdAt: new Date(Number(match[1])), id: match[2] };
}

/** Newest first; `before` continues after the last row of the previous page. */
export async function queryAuditRows(
  where: SQL | undefined,
  { before, limit }: { before?: AuditCursor | null; limit: number },
): Promise<AuditRow[]> {
  const cursor = before
    ? or(
        lt(activities.createdAt, before.createdAt),
        and(eq(activities.createdAt, before.createdAt), lt(activities.id, before.id)),
      )
    : undefined;

  const ticketProject = alias(projects, 'ticket_project');
  const rows = await db
    .select({
      id: activities.id,
      createdAt: activities.createdAt,
      type: activities.type,
      data: activities.data,
      actorId: users.id,
      actorName: users.name,
      actorEmail: users.email,
      actorImage: users.image,
      projectId: projects.id,
      projectName: projects.name,
      projectKey: projects.ticketKey,
      ticketNumber: tickets.ticketNumber,
      ticketTitle: tickets.title,
      ticketProjectId: ticketProject.id,
      ticketProjectKey: ticketProject.ticketKey,
    })
    .from(activities)
    .innerJoin(projects, eq(activities.projectId, projects.id))
    .leftJoin(users, eq(activities.actorId, users.id))
    .leftJoin(tickets, eq(activities.ticketId, tickets.id))
    .leftJoin(ticketProject, eq(tickets.projectId, ticketProject.id))
    .where(and(where, cursor))
    .orderBy(desc(activities.createdAt), desc(activities.id))
    .limit(limit);

  return rows.map((row) => {
    const data = row.data ?? {};
    const dataKey = typeof data.key === 'string' ? data.key : null;
    const liveKey =
      row.ticketNumber !== null && row.ticketProjectKey
        ? `${row.ticketProjectKey}-${row.ticketNumber}`
        : null;
    const key = liveKey ?? dataKey;
    return {
      id: row.id,
      createdAt: row.createdAt,
      type: row.type,
      category: auditCategory(row.type),
      summary: describeAuditEvent(row.type, data),
      actor: row.actorId
        ? {
            id: row.actorId,
            name: row.actorName ?? 'Unknown',
            email: row.actorEmail ?? '',
            image: row.actorImage ?? null,
          }
        : null,
      project: { id: row.projectId, name: row.projectName, key: row.projectKey },
      issue: key
        ? {
            key,
            title: row.ticketTitle ?? (typeof data.title === 'string' ? data.title : null),
            projectId: liveKey ? row.ticketProjectId : null,
          }
        : null,
      data,
    };
  });
}

/** Actors to filter by: members of the scope's teams / workspace, by name. */
export async function auditActorOptions(scope: AuditScope) {
  if (scope.kind === 'project') {
    return db
      .select({ id: users.id, name: users.name, image: users.image })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, scope.id))
      .orderBy(asc(users.name));
  }
  return db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, scope.id))
    .orderBy(asc(users.name));
}

// ---------------------------------------------------------------------------
// Plain-text event summaries (table + CSV). The issue timeline has its own
// rich renderer (components/comments/activity-line.tsx).
// ---------------------------------------------------------------------------

const FIELD_LABEL: Record<string, string> = {
  title: 'title',
  description: 'description',
  stateId: 'status',
  priority: 'priority',
  assigneeId: 'assignee',
  labelIds: 'labels',
  estimate: 'estimate',
  dueDate: 'due date',
  startDate: 'start date',
  parentId: 'parent',
  cycleId: 'cycle',
  epicId: 'epic',
  milestoneId: 'milestone',
};

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'none';
  if (typeof value === 'string') return value.length > 60 ? `${value.slice(0, 59)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length ? value.map(valueText).join(', ') : 'none';
  if (typeof value === 'object') {
    const named = value as { name?: unknown; key?: unknown };
    if (typeof named.name === 'string' && named.name) return named.name;
    if (typeof named.key === 'string') return named.key;
  }
  return '…';
}

function changeText(change: unknown): string {
  if (!change || typeof change !== 'object') return 'changed a field';
  const { field, from, to, added, removed } = change as {
    field?: string;
    from?: unknown;
    to?: unknown;
    added?: unknown[];
    removed?: unknown[];
  };
  const label = (field && FIELD_LABEL[field]) ?? field ?? 'field';
  if (field === 'labelIds') {
    const parts = [
      ...(added ?? []).map((item) => `+${valueText(item)}`),
      ...(removed ?? []).map((item) => `−${valueText(item)}`),
    ];
    return `labels ${parts.join(', ') || 'changed'}`;
  }
  if (field === 'description') return 'description';
  if (field === 'title') return `title → “${valueText(to)}”`;
  return `${label}: ${valueText(from)} → ${valueText(to)}`;
}

const ISSUE_VERBS: Record<string, string> = {
  'issue.created': 'created',
  'issue.archived': 'archived',
  'issue.unarchived': 'unarchived',
  'issue.deleted': 'moved to trash',
  'issue.restored': 'restored',
  'issue.purged': 'permanently deleted',
  'comment.created': 'commented on',
};

export function describeAuditEvent(type: string, data: Record<string, unknown>): string {
  const key = typeof data.key === 'string' ? data.key : null;
  if (type === 'issue.updated') {
    const changes = Array.isArray(data.changes) ? data.changes : [];
    const detail = changes.map(changeText).join('; ');
    return `updated ${key ?? 'an issue'}${detail ? ` — ${detail}` : ''}`;
  }
  const verb = ISSUE_VERBS[type];
  if (verb) return `${verb} ${key ?? 'an issue'}`;
  if (typeof data.summary === 'string' && data.summary) return data.summary;
  return type;
}

/** One flat export record (CSV columns / JSON object). */
export function auditExportRecord(row: AuditRow) {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actorId: row.actor?.id ?? null,
    actorName: row.actor?.name ?? 'System',
    actorEmail: row.actor?.email ?? null,
    type: row.type,
    category: AUDIT_CATEGORY_LABEL[row.category],
    summary: row.summary,
    teamKey: row.project.key,
    teamName: row.project.name,
    issueKey: row.issue?.key ?? null,
    issueTitle: row.issue?.title ?? null,
    data: row.data,
  };
}

// ---------------------------------------------------------------------------
// Writers — never throw: a failed audit write must not fail the change.
// ---------------------------------------------------------------------------

export interface SecurityEventInput {
  actorId: string | null;
  /** `security.*` (or another audit type). */
  type: string;
  /** Short past-tense phrase, e.g. "enabled two-factor authentication". */
  summary: string;
  data?: Record<string, unknown>;
}

type ActivityInsert = typeof activities.$inferInsert;

function row(projectId: string, input: SecurityEventInput, extra: Record<string, unknown>): ActivityInsert {
  return {
    id: crypto.randomUUID(),
    projectId,
    ticketId: null,
    actorId: input.actorId,
    type: input.type,
    data: { ...input.data, ...extra, summary: input.summary },
    createdAt: new Date(),
  };
}

async function insertRows(rows: ActivityInsert[]) {
  if (rows.length === 0) return;
  try {
    await db.insert(activities).values(rows);
  } catch (err) {
    console.error('[audit] failed to write security event', err);
  }
}

/** Anchor project per workspace (oldest project), for workspace-scope rows. */
async function workspaceAnchors(workspaceIds: string[]): Promise<Map<string, string>> {
  if (workspaceIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([projects.workspaceId], {
      workspaceId: projects.workspaceId,
      projectId: projects.id,
    })
    .from(projects)
    .where(inArray(projects.workspaceId, workspaceIds))
    .orderBy(projects.workspaceId, asc(projects.createdAt), asc(projects.id));
  return new Map(rows.map((r) => [r.workspaceId!, r.projectId]));
}

/** A workspace-level event (SSO/SCIM config, provisioning). */
export async function recordWorkspaceEvent(workspaceId: string, input: SecurityEventInput) {
  try {
    const anchor = (await workspaceAnchors([workspaceId])).get(workspaceId);
    if (!anchor) {
      console.warn(`[audit] workspace ${workspaceId} has no team to anchor "${input.type}" on`);
      return;
    }
    await insertRows([row(anchor, input, { scope: 'workspace', workspaceId })]);
  } catch (err) {
    console.error('[audit] failed to record workspace event', err);
  }
}

/** A project-level event. */
export async function recordProjectEvent(projectId: string, input: SecurityEventInput) {
  await insertRows([row(projectId, input, {})]);
}

/**
 * An account-level event (2FA): once per workspace the user belongs to, and
 * once per team of theirs outside any workspace — every admin who can see
 * the user in an audit scope sees it exactly once.
 */
export async function recordUserSecurityEvent(userId: string, input: SecurityEventInput) {
  try {
    const [memberships, loneProjects] = await db.batch([
      db
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, userId)),
      db
        .select({ projectId: projects.id })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(and(eq(projectMembers.userId, userId), isNull(projects.workspaceId))),
    ]);
    const anchors = await workspaceAnchors(memberships.map((m) => m.workspaceId));
    await insertRows([
      ...[...anchors].map(([workspaceId, projectId]) =>
        row(projectId, input, { scope: 'workspace', workspaceId, userId }),
      ),
      ...loneProjects.map((p) => row(p.projectId, input, { userId })),
    ]);
  } catch (err) {
    console.error('[audit] failed to record user security event', err);
  }
}
