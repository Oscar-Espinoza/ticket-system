// Epic dependencies ("project dependencies"): `blocks` and `related` edges
// between two epics of the same project. Write level. Stored rows are
// normalised to (blocker → blocked) or (a ~ b); "blocked by" from the UI is
// the swapped `blocks` row. One relation per pair, no self links, and no
// cycles among `blocks` edges.

import { m } from '@/lib/i18n';
import { and, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import { epicRelations, epics } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { isUniqueViolation } from '@/lib/db-errors';
import { commitWithEvents } from '@/lib/events';
import { fail, refreshesData, type ActionResult } from '@/lib/server/action-kit';
import { isEpicRelationKind, type EpicRelationKind } from '@/lib/epic-model';

export type EpicRelationActionResult = ActionResult<{ id?: string }>;

const relatedEpics = alias(epics, 'related_epic');

/** True when `to` is reachable from `from` over `blocks` edges. */
function reaches(edges: { from: string; to: string }[], from: string, to: string) {
  const next = new Map<string, string[]>();
  for (const edge of edges) next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(next.get(id) ?? []));
  }
  return false;
}

export async function addEpicRelation(input: {
  projectId: string;
  epicId: string;
  otherEpicId: string;
  kind: EpicRelationKind;
}): Promise<EpicRelationActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const { projectId, epicId, otherEpicId, kind } = input;
  if (!isEpicRelationKind(kind)) return fail(m.projects_err_invalid_relation());
  if (typeof epicId !== 'string' || typeof otherEpicId !== 'string' || !epicId || !otherEpicId) {
    return fail(m.projects_err_epic_not_found());
  }
  if (epicId === otherEpicId) return fail(m.projects_err_self_dependency());

  const [found, edges] = await db.batch([
    db
      .select({ id: epics.id, name: epics.name })
      .from(epics)
      .where(and(inArray(epics.id, [epicId, otherEpicId]), eq(epics.projectId, projectId))),
    // Every relation among the project's epics — small, and needed for the cycle walk.
    db
      .select({ from: epicRelations.epicId, to: epicRelations.relatedEpicId, type: epicRelations.type })
      .from(epicRelations)
      .innerJoin(epics, eq(epicRelations.epicId, epics.id))
      .where(eq(epics.projectId, projectId)),
  ]);
  const epic = found.find((e) => e.id === epicId);
  const other = found.find((e) => e.id === otherEpicId);
  if (!epic || !other) return fail(m.projects_err_epic_not_found());

  const pairTaken = edges.some(
    (e) => (e.from === epicId && e.to === otherEpicId) || (e.from === otherEpicId && e.to === epicId),
  );
  if (pairTaken) return fail(m.projects_err_already_linked_remove());

  const [blocker, blocked] = kind === 'blocked_by' ? [other, epic] : [epic, other];
  if (kind !== 'related') {
    const blocks = edges.filter((e) => e.type === 'blocks');
    if (reaches(blocks, blocked.id, blocker.id)) {
      return fail(m.projects_err_already_blocks({ blocked: blocked.name, blocker: blocker.name }));
    }
  }

  const id = crypto.randomUUID();
  try {
    await commitWithEvents(
      [
        db.insert(epicRelations).values({
          id,
          epicId: blocker.id,
          relatedEpicId: blocked.id,
          type: kind === 'related' ? 'related' : 'blocks',
          createdById: authz.userId,
          createdAt: new Date(),
        }),
      ],
      [
        {
          projectId,
          ticketId: null,
          actorId: authz.userId,
          type: 'epic.relation_added',
          data: {
            summary:
              kind === 'related'
                ? `marked epics ${epic.name} and ${other.name} as related`
                : `marked epic ${blocker.name} as blocking ${blocked.name}`,
            relationId: id,
            type: kind === 'related' ? 'related' : 'blocks',
            epicId: blocker.id,
            epicName: blocker.name,
            relatedEpicId: blocked.id,
            relatedEpicName: blocked.name,
          },
        },
      ],
    );
  } catch (err) {
    if (isUniqueViolation(err)) return fail(m.projects_err_already_linked());
    throw err;
  }
  refreshesData();
  return { ok: true, id };
}

export async function removeEpicRelation(input: {
  projectId: string;
  id: string;
}): Promise<EpicRelationActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  if (typeof input.id !== 'string' || !input.id) return fail(m.projects_err_dependency_not_found());

  // Both ends must be the project's epics.
  const [relation] = await db
    .select({
      id: epicRelations.id,
      type: epicRelations.type,
      epicId: epics.id,
      epicName: epics.name,
      relatedEpicId: relatedEpics.id,
      relatedEpicName: relatedEpics.name,
    })
    .from(epicRelations)
    .innerJoin(epics, eq(epicRelations.epicId, epics.id))
    .innerJoin(relatedEpics, eq(epicRelations.relatedEpicId, relatedEpics.id))
    .where(
      and(
        eq(epicRelations.id, input.id),
        eq(epics.projectId, input.projectId),
        eq(relatedEpics.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (!relation) return fail(m.projects_err_dependency_not_found());

  await commitWithEvents(
    [db.delete(epicRelations).where(eq(epicRelations.id, relation.id))],
    [
      {
        projectId: input.projectId,
        ticketId: null,
        actorId: authz.userId,
        type: 'epic.relation_removed',
        data: {
          summary:
            relation.type === 'blocks'
              ? `removed the dependency ${relation.epicName} → ${relation.relatedEpicName}`
              : `unlinked related epics ${relation.epicName} and ${relation.relatedEpicName}`,
          relationId: relation.id,
          type: relation.type,
          epicId: relation.epicId,
          epicName: relation.epicName,
          relatedEpicId: relation.relatedEpicId,
          relatedEpicName: relation.relatedEpicName,
        },
      },
    ],
  );
  refreshesData();
  return { ok: true };
}
