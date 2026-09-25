// Project documents (server-only reads). Every query is membership-gated in
// SQL: a correlated EXISTS on project_member for the viewer, so non-members
// get nothing back rather than an error that confirms the id exists.

import { and, desc, eq, exists, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { documents, epics, projectMembers, projects, tickets, users, workflowStates } from '@/db/schema';
import { db } from '@/lib/db';
import { activeIssue, memberOfIssueProject } from '@/lib/tickets';
import {
  excerptOf,
  type DocumentBacklink,
  type DocumentDetail,
  type DocumentSummary,
} from '@/components/documents/document-model';

const updater = alias(users, 'doc_updater');
const creator = alias(users, 'doc_creator');
const DOC_ID = /^[A-Za-z0-9_-]{1,64}$/;

function viewerIsMember(projectId: AnyPgColumn, userId: string): SQL {
  const viewer = alias(projectMembers, 'doc_viewer');
  return exists(
    db
      .select({ one: sql`1` })
      .from(viewer)
      .where(and(eq(viewer.projectId, projectId), eq(viewer.userId, userId))),
  );
}

/** Escapes LIKE wildcards in user input. */
function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const summaryColumns = {
  id: documents.id,
  projectId: documents.projectId,
  title: documents.title,
  icon: documents.icon,
  // Enough for a preview line without shipping whole docs to the list.
  head: sql<string>`left(${documents.content}, 600)`,
  epicId: epics.id,
  epicName: epics.name,
  epicColor: epics.color,
  updaterId: updater.id,
  updaterName: updater.name,
  updaterImage: updater.image,
  creatorId: creator.id,
  creatorName: creator.name,
  creatorImage: creator.image,
  archivedAt: documents.archivedAt,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
};

function selectSummaries<T extends Record<string, AnyPgColumn | SQL.Aliased | SQL>>(extra: T) {
  return db
    .select({ ...summaryColumns, ...extra })
    .from(documents)
    .leftJoin(epics, eq(epics.id, documents.epicId))
    .leftJoin(updater, eq(updater.id, documents.updatedById))
    .leftJoin(creator, eq(creator.id, documents.createdById));
}

type SummaryRow = Awaited<ReturnType<typeof selectSummaries<Record<never, never>>>>[number];

function toSummary(row: SummaryRow): DocumentSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    icon: row.icon,
    epic: row.epicId ? { id: row.epicId, name: row.epicName ?? '', color: row.epicColor } : null,
    excerpt: excerptOf(row.head ?? ''),
    updatedBy: row.updaterId ? { id: row.updaterId, name: row.updaterName ?? '', image: row.updaterImage } : null,
    createdBy: row.creatorId ? { id: row.creatorId, name: row.creatorName ?? '', image: row.creatorImage } : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The project's documents (archived included; the list filters), newest first. `q` searches title + content. */
export async function getProjectDocuments(projectId: string, userId: string, q?: string): Promise<DocumentSummary[]> {
  if (!projectId || !userId) return [];
  const query = q?.trim().slice(0, 200);
  const rows = await selectSummaries({})
    .where(
      and(
        eq(documents.projectId, projectId),
        viewerIsMember(documents.projectId, userId),
        query ? or(ilike(documents.title, likePattern(query)), ilike(documents.content, likePattern(query))) : undefined,
      ),
    )
    .orderBy(desc(documents.updatedAt))
    .limit(500);
  return rows.map(toSummary);
}

export async function getDocument(projectId: string, documentId: string, userId: string): Promise<DocumentDetail | null> {
  if (!projectId || !userId || !DOC_ID.test(documentId)) return null;
  const [row] = await selectSummaries({ content: documents.content })
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.projectId, projectId),
        viewerIsMember(documents.projectId, userId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { ...toSummary(row), content: row.content };
}

/**
 * Issues whose description links this document ("Mentioned in"), from any
 * project the viewer belongs to. Matches the in-app path, so full URLs and
 * relative links both count.
 */
export async function getDocumentBacklinks(
  projectId: string,
  documentId: string,
  userId: string,
): Promise<DocumentBacklink[]> {
  if (!projectId || !userId || !DOC_ID.test(documentId)) return [];
  const needle = likePattern(`/projects/${projectId}/docs/${documentId}`);
  const rows = await db
    .select({
      id: tickets.id,
      number: tickets.ticketNumber,
      title: tickets.title,
      projectId: tickets.projectId,
      ticketKey: projects.ticketKey,
      stateName: workflowStates.name,
      stateType: workflowStates.type,
      stateColor: workflowStates.color,
    })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .innerJoin(workflowStates, eq(workflowStates.id, tickets.stateId))
    .where(and(ilike(tickets.description, needle), activeIssue(), memberOfIssueProject(userId)))
    .orderBy(desc(tickets.updatedAt))
    .limit(50);
  return rows.map((row) => ({
    id: row.id,
    key: `${row.ticketKey}-${row.number}`,
    title: row.title,
    projectId: row.projectId,
    state: { name: row.stateName, type: row.stateType, color: row.stateColor },
  }));
}

/**
 * Active documents linked to an epic, for the epic detail page. Membership of
 * the documents' project is checked here; callers still gate the epic itself.
 */
export async function documentsForEpic(epicId: string, userId: string): Promise<DocumentSummary[]> {
  if (!epicId || !userId) return [];
  const rows = await selectSummaries({})
    .where(and(eq(documents.epicId, epicId), isNull(documents.archivedAt), viewerIsMember(documents.projectId, userId)))
    .orderBy(desc(documents.updatedAt))
    .limit(100);
  return rows.map(toSummary);
}

export interface DocumentSearchResult extends DocumentSummary {
  projectName: string;
  projectKey: string;
}

/** Title / content search across every project the viewer belongs to (active docs). */
export async function searchDocuments(userId: string, q: string, limit = 20): Promise<DocumentSearchResult[]> {
  const query = q.trim().slice(0, 200);
  if (!userId || !query) return [];
  const pattern = likePattern(query);
  const rows = await selectSummaries({ projectName: projects.name, projectKey: projects.ticketKey })
    .innerJoin(projects, eq(projects.id, documents.projectId))
    .where(
      and(
        isNull(documents.archivedAt),
        viewerIsMember(documents.projectId, userId),
        or(ilike(documents.title, pattern), ilike(documents.content, pattern)),
      ),
    )
    // Title hits first, then the most recently edited.
    .orderBy(sql`(${documents.title} ilike ${pattern}) desc`, desc(documents.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  return rows.map((row) => ({ ...toSummary(row), projectName: row.projectName, projectKey: row.projectKey }));
}
