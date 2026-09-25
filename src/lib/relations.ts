// Issue relations DAL. NO AUTHORIZATION here — callers (src/app/actions/relations.ts)
// authorize first; every function scopes by projectId so ids can't reach across projects.
//
// Storage: one `issue_relation` row per relation. `blocks` = ticket blocks
// related, `duplicate` = ticket duplicates related, `related` is symmetric.
// "Blocked by" / "Duplicated by" are the inverse views of the same rows.

import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { issueRelations, projects, tickets, workflowStates } from '@/db/schema';
import { prepareIssueEvents, publishIssueEvents } from '@/lib/events';
import { updateIssueFields } from '@/lib/issue-service';
import type { IssueRow } from '@/lib/issue-model';
import { queryIssues } from '@/lib/tickets';
import { firstStateOfType } from '@/lib/workflow';

export type RelationKind = 'blocks' | 'blocked_by' | 'related' | 'duplicate_of' | 'duplicated_by';
/** What the "add relation" menu offers; "duplicated by" is only ever an inverse view. */
export type AddableRelationKind = Exclude<RelationKind, 'duplicated_by'>;

export const ADDABLE_RELATION_KINDS: readonly AddableRelationKind[] = [
  'blocks',
  'blocked_by',
  'related',
  'duplicate_of',
];

export interface IssueRelationView {
  /** The issue_relation row id. */
  id: string;
  /** Seen from the issue whose relations were listed. */
  kind: RelationKind;
  /** The other issue. */
  issue: IssueRow;
}

/** `warning`: the relation was saved but a follow-up (duplicate state move) failed. */
export type RelationResult = { ok: true; warning?: string } | { ok: false; error: string };

type StoredType = (typeof issueRelations.$inferSelect)['type'];

/** The row's meaning from `ticketId`'s side. */
function viewKind(type: StoredType, ticketIsSource: boolean): RelationKind {
  if (type === 'blocks') return ticketIsSource ? 'blocks' : 'blocked_by';
  if (type === 'duplicate') return ticketIsSource ? 'duplicate_of' : 'duplicated_by';
  return 'related';
}

/** "blocking APP-3" — completes "marked as …" / "no longer …". */
function phrase(kind: RelationKind, otherKey: string): string {
  switch (kind) {
    case 'blocks':
      return `blocking ${otherKey}`;
    case 'blocked_by':
      return `blocked by ${otherKey}`;
    case 'related':
      return `related to ${otherKey}`;
    case 'duplicate_of':
      return `a duplicate of ${otherKey}`;
    case 'duplicated_by':
      return `duplicated by ${otherKey}`;
  }
}

interface TicketRef {
  id: string;
  key: string;
  title: string;
  deletedAt: Date | null;
}

async function loadTickets(projectId: string, ids: string[]): Promise<Map<string, TicketRef>> {
  const rows = await db
    .select({
      id: tickets.id,
      number: tickets.ticketNumber,
      ticketKey: projects.ticketKey,
      title: tickets.title,
      deletedAt: tickets.deletedAt,
    })
    .from(tickets)
    .innerJoin(projects, eq(tickets.projectId, projects.id))
    .where(and(eq(tickets.projectId, projectId), inArray(tickets.id, ids)));
  return new Map(
    rows.map((r) => [
      r.id,
      { id: r.id, key: `${r.ticketKey}-${r.number}`, title: r.title, deletedAt: r.deletedAt },
    ]),
  );
}

/** Both sides of a relation change: bump updatedAt (timelines refetch) + one event per issue. */
function relationWrites(
  projectId: string,
  actorId: string,
  type: 'relation.created' | 'relation.removed',
  source: TicketRef,
  target: TicketRef,
  stored: StoredType,
) {
  const verb = type === 'relation.created' ? 'marked as' : 'no longer';
  const side = (self: TicketRef, other: TicketRef, isSource: boolean) => {
    const kind = viewKind(stored, isSource);
    return {
      projectId,
      ticketId: self.id,
      actorId,
      type,
      data: {
        key: self.key,
        title: self.title,
        summary: `${verb} ${phrase(kind, other.key)}`,
        relation: kind,
        relatedIssue: { id: other.id, key: other.key, title: other.title },
      },
    };
  };
  const events = prepareIssueEvents([side(source, target, true), side(target, source, false)]);
  const touch = db
    .update(tickets)
    .set({ updatedAt: new Date() })
    .where(and(eq(tickets.projectId, projectId), inArray(tickets.id, [source.id, target.id])));
  return { events, touch };
}

/** Every relation of the issue; relations to trashed issues are hidden. */
export async function listIssueRelations(
  projectId: string,
  ticketId: string,
): Promise<IssueRelationView[]> {
  const rows = await db
    .select({
      id: issueRelations.id,
      ticketId: issueRelations.ticketId,
      relatedTicketId: issueRelations.relatedTicketId,
      type: issueRelations.type,
    })
    .from(issueRelations)
    .innerJoin(tickets, eq(issueRelations.ticketId, tickets.id))
    .where(
      and(
        eq(tickets.projectId, projectId),
        or(eq(issueRelations.ticketId, ticketId), eq(issueRelations.relatedTicketId, ticketId)),
      ),
    )
    .orderBy(issueRelations.createdAt);
  if (rows.length === 0) return [];

  const otherIds = rows.map((r) => (r.ticketId === ticketId ? r.relatedTicketId : r.ticketId));
  const others = await queryIssues(
    and(eq(tickets.projectId, projectId), inArray(tickets.id, otherIds), isNull(tickets.deletedAt)),
  );
  const byId = new Map(others.map((issue) => [issue.id, issue]));

  return rows.flatMap((r) => {
    const isSource = r.ticketId === ticketId;
    const issue = byId.get(isSource ? r.relatedTicketId : r.ticketId);
    return issue ? [{ id: r.id, kind: viewKind(r.type, isSource), issue }] : [];
  });
}

export async function createIssueRelation(
  actorId: string,
  projectId: string,
  input: { ticketId: unknown; relatedTicketId: unknown; kind: unknown },
): Promise<RelationResult> {
  const { ticketId, relatedTicketId, kind } = input;
  if (typeof ticketId !== 'string' || typeof relatedTicketId !== 'string' || !ticketId || !relatedTicketId) {
    return { ok: false, error: 'Issue not found.' };
  }
  if (!ADDABLE_RELATION_KINDS.includes(kind as AddableRelationKind)) {
    return { ok: false, error: 'Invalid relation type.' };
  }
  if (ticketId === relatedTicketId) return { ok: false, error: "An issue can't be related to itself." };

  const found = await loadTickets(projectId, [ticketId, relatedTicketId]);
  const self = found.get(ticketId);
  const other = found.get(relatedTicketId);
  if (!self || !other || self.deletedAt || other.deletedAt) {
    return { ok: false, error: 'Issue not found.' };
  }

  // Normalize to the stored direction ("A blocked by B" = "B blocks A").
  const [source, target] = kind === 'blocked_by' ? [other, self] : [self, other];
  const type: StoredType =
    kind === 'related' ? 'related' : kind === 'duplicate_of' ? 'duplicate' : 'blocks';

  // Same type in either direction already exists (incl. the blocks ↔ blocked-by inverse).
  const [existing] = await db
    .select({ id: issueRelations.id })
    .from(issueRelations)
    .where(
      and(
        eq(issueRelations.type, type),
        or(
          and(eq(issueRelations.ticketId, source.id), eq(issueRelations.relatedTicketId, target.id)),
          and(eq(issueRelations.ticketId, target.id), eq(issueRelations.relatedTicketId, source.id)),
        ),
      ),
    )
    .limit(1);
  if (existing) return { ok: false, error: `${self.key} and ${other.key} are already linked that way.` };

  const { events, touch } = relationWrites(projectId, actorId, 'relation.created', source, target, type);
  await db.batch([
    db
      .insert(issueRelations)
      .values({
        id: crypto.randomUUID(),
        ticketId: source.id,
        relatedTicketId: target.id,
        type,
        createdById: actorId,
        createdAt: new Date(),
      })
      .onConflictDoNothing(),
    touch,
    events.insert,
  ]);
  publishIssueEvents(events.stored);

  if (kind === 'duplicate_of') {
    const state = await duplicateState(projectId);
    if (state) {
      const moved = await updateIssueFields({ userId: actorId }, projectId, self.id, { stateId: state });
      if (!moved.ok) return { ok: true, warning: `Linked, but couldn't move ${self.key}: ${moved.error}` };
    }
  }
  return { ok: true };
}

/** The project's "Duplicate" canceled state, else its first canceled state. */
async function duplicateState(projectId: string): Promise<string | null> {
  const states = await db
    .select({
      id: workflowStates.id,
      name: workflowStates.name,
      type: workflowStates.type,
      color: workflowStates.color,
      position: workflowStates.position,
      description: workflowStates.description,
    })
    .from(workflowStates)
    .where(and(eq(workflowStates.projectId, projectId), eq(workflowStates.type, 'canceled')));
  const named = states.find((s) => s.name.trim().toLowerCase() === 'duplicate');
  return (named ?? firstStateOfType(states, 'canceled'))?.id ?? null;
}

export async function deleteIssueRelation(
  actorId: string,
  projectId: string,
  relationId: unknown,
): Promise<RelationResult> {
  if (typeof relationId !== 'string' || !relationId) return { ok: false, error: 'Relation not found.' };
  const [row] = await db
    .select({
      ticketId: issueRelations.ticketId,
      relatedTicketId: issueRelations.relatedTicketId,
      type: issueRelations.type,
    })
    .from(issueRelations)
    .innerJoin(tickets, eq(issueRelations.ticketId, tickets.id))
    .where(and(eq(issueRelations.id, relationId), eq(tickets.projectId, projectId)))
    .limit(1);
  if (!row) return { ok: false, error: 'Relation not found.' };

  const found = await loadTickets(projectId, [row.ticketId, row.relatedTicketId]);
  const source = found.get(row.ticketId);
  const target = found.get(row.relatedTicketId);
  if (!source || !target) return { ok: false, error: 'Relation not found.' };

  const { events, touch } = relationWrites(projectId, actorId, 'relation.removed', source, target, row.type);
  await db.batch([
    db.delete(issueRelations).where(eq(issueRelations.id, relationId)),
    touch,
    events.insert,
  ]);
  publishIssueEvents(events.stored);
  return { ok: true };
}
