// Full-text issue search across the viewer's projects. Uses the exact
// expressions behind migration 0003's GIN indexes (ticket title+description,
// comment body) so Postgres can use them. Server-only.
//
// Snippets come from ts_headline wrapped in private-use sentinels (never HTML);
// the client splits on them and renders <mark> elements itself.

import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { comments, projects, tickets } from '@/db/schema';
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
  const q = rawQuery.trim().slice(0, MAX_QUERY);
  if (!q) return [];
  const query = sql`websearch_to_tsquery('english', ${q})`;

  // Shared scope: the viewer's projects, never trashed, archived only on request.
  const scope: SQL[] = [memberOfIssueProject(userId), isNull(tickets.deletedAt)];
  if (!options.includeArchived) scope.push(isNull(tickets.archivedAt));
  if (options.projectId) scope.push(eq(tickets.projectId, options.projectId));

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
