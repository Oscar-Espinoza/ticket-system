// Full-text issue search across the viewer's projects. Uses the exact
// expressions behind migration 0003's GIN indexes (ticket title+description,
// comment body) so Postgres can use them. Server-only.
//
// Snippets come from ts_headline wrapped in private-use sentinels (never HTML);
// the client splits on them and renders <mark> elements itself.
//
// Queries may carry filter syntax (label:bug assignee:me …, parsed by
// lib/issue-filtering); the terms become SQL inside the same membership scope.

import { and, desc, eq, exists, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import { comments, cycles, epics, issueLabels, labels, projects, tickets, users, workflowStates } from '@/db/schema';
import { addDays, fromDateString, toDateString } from '@/lib/dates';
import {
  SLA_RISK_MS,
  parseSearchQuery,
  searchCycle,
  searchDue,
  searchIs,
  searchPriority,
  searchSla,
  searchStateType,
  searchTimeRange,
  type SearchTerm,
} from '@/lib/issue-filtering';
import type { IssueRow } from '@/lib/issue-model';
import { stripMentions } from '@/lib/mentions';
import { memberOfIssueProject, queryIssues } from '@/lib/tickets';

/** Highlight delimiters (Unicode private use area — never typed by users). */
export const MARK_START = '';
export const MARK_END = '';

const MAX_QUERY = 200;
const LIMIT = 50;
const HEADLINE = `StartSel=${MARK_START}, StopSel=${MARK_END}`;
const SNIPPET = `${HEADLINE}, MaxWords=24, MinWords=8, MaxFragments=2, FragmentDelimiter=" … "`;

export interface SearchOptions {
  projectId?: string | null;
  includeArchived?: boolean;
}

export interface SearchResult {
  issue: IssueRow;
  /** Title with MARK_START/MARK_END around matched terms. */
  title: string;
  /** Description or comment excerpt with marks; null when nothing matched there. */
  snippet: { source: 'description' | 'comment'; text: string } | null;
  exactKey: boolean;
}

const KEY_PATTERN = /^\s*([A-Za-z0-9]+)-(\d{1,9})\s*$/;

// ---------------------------------------------------------------------------
// Query syntax → SQL. Every condition is a plain predicate or a correlated
// EXISTS on `ticket` columns, so it composes with any query selecting from
// tickets (the full-text queries, the comment join, queryIssues).
// ---------------------------------------------------------------------------

const FALSE = sql`false`;
const lower = (value: string) => value.toLowerCase();
const contains = (column: AnyPgColumn, value: string) =>
  sql`position(${lower(value)} in lower(${column})) > 0`;

function stateWhere(where: SQL): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(workflowStates)
      .where(and(eq(workflowStates.id, tickets.stateId), where)),
  );
}

const openState = () => stateWhere(sql`${workflowStates.type} not in ('completed', 'canceled')`);

function userWhere(column: AnyPgColumn, value: string, userId: string): SQL {
  const v = lower(value);
  if (v === 'me') return eq(column, userId);
  if (v === 'none' || v === 'unassigned') return isNull(column);
  return exists(
    db
      .select({ one: sql`1` })
      .from(users)
      .where(and(eq(users.id, column), or(eq(users.id, value), contains(users.name, value)))),
  );
}

/** Monday..Sunday (server calendar) of the week containing `today`, offset by `weeks`. */
function weekRange(today: string, weeks: number): [string, string] {
  const date = fromDateString(today);
  const monday = addDays(date, -((date.getDay() + 6) % 7) + weeks * 7);
  return [toDateString(monday), toDateString(addDays(monday, 6))];
}

function valueCondition(key: SearchTerm['key'], value: string, userId: string, now: Date): SQL {
  const v = lower(value);
  switch (key) {
    case 'is': {
      const is = searchIs(v);
      if (is === 'open') return openState();
      if (is === 'closed') return stateWhere(sql`${workflowStates.type} in ('completed', 'canceled')`);
      if (is === 'completed' || is === 'canceled') return stateWhere(eq(workflowStates.type, is));
      if (is === 'archived') return isNotNull(tickets.archivedAt);
      return FALSE;
    }
    case 'status':
      return stateWhere(contains(workflowStates.name, value));
    case 'type': {
      const type = searchStateType(v);
      return type ? stateWhere(eq(workflowStates.type, type)) : FALSE;
    }
    case 'assignee':
      return userWhere(tickets.assigneeId, value, userId);
    case 'creator':
      return userWhere(tickets.creatorId, value, userId);
    case 'priority': {
      const priority = searchPriority(v);
      return priority ? eq(tickets.priority, priority) : FALSE;
    }
    case 'label':
      if (v === 'none') {
        return sql`not ${exists(db.select({ one: sql`1` }).from(issueLabels).where(eq(issueLabels.ticketId, tickets.id)))}`;
      }
      return exists(
        db
          .select({ one: sql`1` })
          .from(issueLabels)
          .innerJoin(labels, eq(issueLabels.labelId, labels.id))
          .where(and(eq(issueLabels.ticketId, tickets.id), sql`lower(${labels.name}) = ${v}`)),
      );
    case 'project':
      return exists(
        db
          .select({ one: sql`1` })
          .from(projects)
          .where(
            and(
              eq(projects.id, tickets.projectId),
              or(sql`lower(${projects.ticketKey}) = ${v}`, sql`lower(${projects.name}) = ${v}`),
            ),
          ),
      );
    case 'cycle': {
      const word = searchCycle(v);
      if (word === null) return FALSE;
      if (word === 'none') return isNull(tickets.cycleId);
      const where =
        typeof word === 'number'
          ? eq(cycles.number, word)
          : word === 'current'
            ? and(lte(cycles.startsAt, now), gt(cycles.endsAt, now), isNull(cycles.completedAt))
            : word === 'next'
              ? gt(cycles.startsAt, now)
              : or(lte(cycles.endsAt, now), isNotNull(cycles.completedAt));
      return exists(db.select({ one: sql`1` }).from(cycles).where(and(eq(cycles.id, tickets.cycleId), where)));
    }
    case 'epic':
      if (v === 'none') return isNull(tickets.epicId);
      return exists(
        db
          .select({ one: sql`1` })
          .from(epics)
          .where(and(eq(epics.id, tickets.epicId), contains(epics.name, value))),
      );
    case 'due': {
      const due = searchDue(v);
      const today = toDateString(now);
      switch (due) {
        case 'none':
          return isNull(tickets.dueDate);
        case 'overdue':
          return and(lt(tickets.dueDate, today), openState())!;
        case 'today':
          return eq(tickets.dueDate, today);
        case 'thisWeek':
        case 'nextWeek': {
          const [start, end] = weekRange(today, due === 'thisWeek' ? 0 : 1);
          return and(gte(tickets.dueDate, start), lte(tickets.dueDate, end))!;
        }
        default:
          return FALSE;
      }
    }
    case 'created':
    case 'updated': {
      const range = searchTimeRange(v, now.getTime());
      if (!range) return FALSE;
      const column = key === 'created' ? tickets.createdAt : tickets.updatedAt;
      return and(
        range.after === undefined ? undefined : gte(column, new Date(range.after)),
        range.before === undefined ? undefined : lt(column, new Date(range.before)),
      )!;
    }
    case 'sla': {
      const sla = searchSla(v);
      switch (sla) {
        case 'breached':
          return or(isNotNull(tickets.slaBreachedAt), and(lte(tickets.slaDueAt, now), openState()))!;
        case 'risk':
          return and(
            isNull(tickets.slaBreachedAt),
            gt(tickets.slaDueAt, now),
            lt(tickets.slaDueAt, new Date(now.getTime() + SLA_RISK_MS)),
            openState(),
          )!;
        case 'none':
          return isNull(tickets.slaDueAt);
        case 'any':
          return isNotNull(tickets.slaDueAt);
        default:
          return FALSE;
      }
    }
  }
}

/** SQL for parsed query terms (AND of terms; values any-of; `-` negates). */
export function searchTermConditions(terms: SearchTerm[], userId: string, now = new Date()): SQL[] {
  return terms.map((term) => {
    const any = or(...term.values.map((value) => valueCondition(term.key, value, userId, now)))!;
    // coalesce: a NULL comparison (e.g. no due date) must not survive negation as NULL.
    return term.negate ? sql`not coalesce((${any}), false)` : any;
  });
}

/** Whether the terms ask for archived issues explicitly (`is:archived`). */
export function wantsArchived(terms: SearchTerm[]): boolean {
  return terms.some((t) => t.key === 'is' && !t.negate && t.values.some((v) => searchIs(v) === 'archived'));
}

// Must match the index expression in 0003_seed_workflow_states.sql exactly.
const issueDocument = sql`to_tsvector('english', coalesce(${tickets.title}, '') || ' ' || coalesce(${tickets.description}, ''))`;
const commentDocument = sql`to_tsvector('english', ${comments.body})`;

function hasMark(text: string | null): text is string {
  return !!text && text.includes(MARK_START);
}

export async function searchIssues(
  userId: string,
  rawQuery: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const parsed = parseSearchQuery(rawQuery.trim().slice(0, MAX_QUERY));
  const q = parsed.text.trim();
  if (!q && parsed.terms.length === 0) return [];

  // Shared scope: the viewer's projects, never trashed, archived only on
  // request (the toggle or `is:archived`), plus the query's filter terms.
  const scope: SQL[] = [memberOfIssueProject(userId), isNull(tickets.deletedAt)];
  if (!options.includeArchived && !wantsArchived(parsed.terms)) scope.push(isNull(tickets.archivedAt));
  if (options.projectId) scope.push(eq(tickets.projectId, options.projectId));
  scope.push(...searchTermConditions(parsed.terms, userId));

  // Filters only (`assignee:me is:open`): list the matches, recently updated first.
  if (!q) {
    const issues = await queryIssues(and(...scope), {
      orderBy: [desc(tickets.updatedAt)],
      limit: LIMIT,
    });
    return issues.map((issue) => ({ issue, title: issue.title, snippet: null, exactKey: false }));
  }
  const query = sql`websearch_to_tsquery('english', ${q})`;

  const issueRank = sql<number>`ts_rank(${issueDocument}, ${query})`;
  const issueMatches = db
    .select({
      id: tickets.id,
      rank: issueRank,
      title: sql<string>`ts_headline('english', ${tickets.title}, ${query}, ${`${HEADLINE}, HighlightAll=true`})`,
      snippet: sql<string | null>`case when ${tickets.description} is null then null else ts_headline('english', ${tickets.description}, ${query}, ${SNIPPET}) end`,
    })
    .from(tickets)
    .where(and(sql`${issueDocument} @@ ${query}`, ...scope))
    .orderBy(desc(issueRank))
    .limit(LIMIT);

  // Best-ranked matching comment per issue, then the best issues overall.
  const commentHits = db
    .selectDistinctOn([comments.ticketId], {
      id: comments.ticketId,
      rank: sql<number>`ts_rank(${commentDocument}, ${query})`.as('rank'),
      body: comments.body,
    })
    .from(comments)
    .innerJoin(tickets, eq(comments.ticketId, tickets.id))
    .where(and(sql`${commentDocument} @@ ${query}`, ...scope))
    .orderBy(comments.ticketId, sql`ts_rank(${commentDocument}, ${query}) desc`)
    .as('comment_hits');
  // Headlines only for the rows we keep (ts_headline re-parses the text).
  const commentMatches = db
    .select({
      id: commentHits.id,
      rank: commentHits.rank,
      snippet: sql<string>`ts_headline('english', ${commentHits.body}, ${query}, ${SNIPPET})`,
    })
    .from(commentHits)
    .orderBy(desc(commentHits.rank))
    .limit(LIMIT);

  const key = KEY_PATTERN.exec(q);
  const keyMatch = db
    .select({ id: tickets.id })
    .from(tickets)
    .innerJoin(projects, eq(tickets.projectId, projects.id))
    .where(
      key
        ? and(
            sql`upper(${projects.ticketKey}) = ${key[1].toUpperCase()}`,
            eq(tickets.ticketNumber, Number(key[2])),
            ...scope,
          )
        : sql`false`,
    )
    .limit(1);

  const [issueRows, commentRows, keyRows] = await db.batch([issueMatches, commentMatches, keyMatch]);

  // Merge: exact key first, then by best rank (title/description or comment).
  const merged = new Map<
    string,
    { rank: number; title: string | null; snippet: SearchResult['snippet']; exactKey: boolean }
  >();
  for (const row of issueRows) {
    merged.set(row.id, {
      rank: Number(row.rank),
      title: row.title,
      snippet: hasMark(row.snippet) ? { source: 'description', text: stripMentions(row.snippet) } : null,
      exactKey: false,
    });
  }
  for (const row of commentRows) {
    const existing = merged.get(row.id);
    const snippet = hasMark(row.snippet)
      ? { source: 'comment' as const, text: stripMentions(row.snippet) }
      : null;
    if (existing) {
      existing.rank = Math.max(existing.rank, Number(row.rank));
      existing.snippet ??= snippet;
    } else {
      merged.set(row.id, { rank: Number(row.rank), title: null, snippet, exactKey: false });
    }
  }
  for (const row of keyRows) {
    const existing = merged.get(row.id);
    if (existing) existing.exactKey = true;
    else merged.set(row.id, { rank: Infinity, title: null, snippet: null, exactKey: true });
  }
  if (merged.size === 0) return [];

  const issues = await queryIssues(inArray(tickets.id, [...merged.keys()]));
  return issues
    .map((issue) => {
      const hit = merged.get(issue.id)!;
      const result: SearchResult = {
        issue,
        title: hit.title ?? issue.title,
        snippet: hit.snippet,
        exactKey: hit.exactKey,
      };
      return { result, rank: hit.rank };
    })
    .sort((a, b) => Number(b.result.exactKey) - Number(a.result.exactKey) || b.rank - a.rank)
    .slice(0, LIMIT)
    .map(({ result }) => result);
}
