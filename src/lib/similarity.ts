// Similar-issue engine (server-only) behind duplicate detection and triage
// suggestions. Pure Postgres heuristics — no LLM (see .planning/PAID-FEATURES.md):
//
// - candidates come from two GIN indexes: trigram `title % $title`
//   (ticket_title_trgm_idx, pg_trgm's default 0.3 threshold) OR full-text match
//   of the title's words against the ticket_search_idx document;
// - score = 0.6 × trigram similarity of the titles
//         + 0.3 × share of the title's lexemes found in the candidate
//         + 0.1 × share of the description's lexemes found (when one is given),
//   and closed or archived issues are damped so open ones rank first.
//
// Scoped in SQL to the project AND the viewer's membership; trashed issues never
// come back.

import { and, desc, eq, inArray, isNull, notInArray, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { tickets, workflowStates } from '@/db/schema';
import type { IssueRow } from '@/lib/issue-model';
import { memberOfIssueProject, queryIssues } from '@/lib/tickets';

export interface SimilarIssue {
  issue: IssueRow;
  /** 0–1, after the closed-issue damping. */
  score: number;
  /** Short human explanation, e.g. "Similar title · 3 of 4 keywords". */
  reason: string;
}

export interface SimilarityQuery {
  title: string;
  description?: string | null;
  /** Never returned (the issue itself, already-related issues). */
  excludeIds?: string[];
  limit?: number;
  minScore?: number;
}

export const SIMILARITY_MIN_SCORE = 0.3;
const MAX_LIMIT = 20;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 1000;
/** Description lexemes that count toward its overlap (keeps long texts from diluting it). */
const DESCRIPTION_LEXEMES = 10;
const CLOSED_DAMPING = 0.85;

// Must match the index expression in 0003_seed_workflow_states.sql exactly.
const issueDocument = sql`to_tsvector('english', coalesce(${tickets.title}, '') || ' ' || coalesce(${tickets.description}, ''))`;

/** Distinct words for an OR full-text query ("login or safari or redirect"). */
function orQuery(text: string): string {
  const words = new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((w) => w !== 'or' && w !== 'and'),
  );
  return [...words].slice(0, 16).join(' or ');
}

function describe(trigram: number, matched: number, total: number): string {
  const parts: string[] = [];
  if (trigram >= 0.5) parts.push('Very similar title');
  else if (trigram >= 0.3) parts.push('Similar title');
  if (total > 0 && matched > 0) parts.push(`${matched} of ${total} keywords`);
  return parts.join(' · ') || 'Related wording';
}

/** Issues of `projectId` similar to the given text, best first. */
export async function findSimilarIssues(
  userId: string,
  projectId: string,
  query: SimilarityQuery,
): Promise<SimilarIssue[]> {
  const title = query.title.trim().slice(0, MAX_TITLE);
  if (title.length < 3 || !projectId || !userId) return [];
  const description = (query.description ?? '').trim().slice(0, MAX_DESCRIPTION);
  const limit = Math.max(1, Math.min(MAX_LIMIT, query.limit ?? 5));
  const minScore = query.minScore ?? SIMILARITY_MIN_SCORE;
  const words = orQuery(title);

  const titleLexemes = sql`tsvector_to_array(to_tsvector('english', ${title}))`;
  // The description's lexemes that aren't already in the title.
  const descriptionLexemes = sql`array(select d from unnest(tsvector_to_array(to_tsvector('english', ${description}))) d where not d = any(${titleLexemes}) limit ${DESCRIPTION_LEXEMES})`;
  const candidateLexemes = sql`tsvector_to_array(${issueDocument})`;

  const trigram = sql<number>`similarity(${tickets.title}, ${title})`;
  const titleMatched = sql<number>`cardinality(array(select l from unnest(${candidateLexemes}) l where l = any(${titleLexemes})))`;
  const titleTotal = sql<number>`cardinality(${titleLexemes})`;
  const coverage = sql`(${titleMatched})::float8 / greatest(${titleTotal}, 1)`;
  const descriptionOverlap = description
    ? sql`cardinality(array(select l from unnest(${candidateLexemes}) l where l = any(${descriptionLexemes})))::float8 / greatest(cardinality(${descriptionLexemes}), 1)`
    : null;
  const raw = descriptionOverlap
    ? sql`0.6 * ${trigram} + 0.3 * ${coverage} + 0.1 * ${descriptionOverlap}`
    : sql`(0.6 * ${trigram} + 0.3 * ${coverage}) / 0.9`;
  const closed = sql`(${workflowStates.type} in ('completed', 'canceled') or ${tickets.archivedAt} is not null)`;
  const score = sql<number>`(${raw}) * (case when ${closed} then ${sql.raw(String(CLOSED_DAMPING))} else 1 end)`;

  const match: SQL[] = [sql`${tickets.title} % ${title}`];
  if (words) match.push(sql`${issueDocument} @@ websearch_to_tsquery('english', ${words})`);
  const excludeIds = (query.excludeIds ?? []).filter((id) => typeof id === 'string' && id);

  const rows = await db
    .select({
      id: tickets.id,
      score,
      trigram,
      matched: titleMatched,
      total: titleTotal,
    })
    .from(tickets)
    .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
    .where(
      and(
        eq(tickets.projectId, projectId),
        isNull(tickets.deletedAt),
        memberOfIssueProject(userId),
        excludeIds.length ? notInArray(tickets.id, excludeIds) : undefined,
        sql`(${sql.join(match, sql` or `)})`,
      ),
    )
    .orderBy(desc(score))
    .limit(limit * 2);

  const hits = rows
    .map((row) => ({ ...row, score: Number(row.score), trigram: Number(row.trigram) }))
    .filter((row) => row.score >= minScore)
    .slice(0, limit);
  if (hits.length === 0) return [];

  const issues = new Map(
    (await queryIssues(inArray(tickets.id, hits.map((h) => h.id)))).map((i) => [i.id, i]),
  );
  return hits.flatMap((hit) => {
    const issue = issues.get(hit.id);
    if (!issue) return [];
    return [
      {
        issue,
        score: Math.round(hit.score * 100) / 100,
        reason: describe(hit.trigram, Number(hit.matched), Number(hit.total)),
      },
    ];
  });
}
