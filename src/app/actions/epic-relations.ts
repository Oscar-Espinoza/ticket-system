'use server';

// Epic dependencies ("project dependencies"): `blocks` and `related` edges
// between two epics of the same project. Write level. Stored rows are
// normalised to (blocker → blocked) or (a ~ b); "blocked by" from the UI is
// the swapped `blocks` row. One relation per pair, no self links, and no
// cycles among `blocks` edges.

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import { epicRelations, epics } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { emitIssueEvent } from '@/lib/events';
import { isEpicRelationKind, type EpicRelationKind } from '@/components/epics/epic-model';

export type EpicRelationActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

const fail = (error: string): EpicRelationActionResult => ({ ok: false, error });
const relatedEpics = alias(epics, 'related_epic');

function revalidate(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`, 'layout');
}

function isUniqueViolation(err: unknown) {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}

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
  if (!isEpicRelationKind(kind)) return fail('Invalid relation.');
  if (typeof epicId !== 'string' || typeof otherEpicId !== 'string' || !epicId || !otherEpicId) {
    return fail('Epic not found.');
  }
  if (epicId === otherEpicId) return fail('An epic can’t depend on itself.');

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
  if (!epic || !other) return fail('Epic not found.');

  const pairTaken = edges.some(
    (e) => (e.from === epicId && e.to === otherEpicId) || (e.from === otherEpicId && e.to === epicId),
  );
  if (pairTaken) return fail('These epics are already linked — remove that dependency first.');

  const [blocker, blocked] = kind === 'blocked_by' ? [other, epic] : [epic, other];
  if (kind !== 'related') {
    const blocks = edges.filter((e) => e.type === 'blocks');
    if (reaches(blocks, blocked.id, blocker.id)) {
      return fail(`${blocked.name} already blocks ${blocker.name} (directly or through other epics).`);
    }
  }

  const id = crypto.randomUUID();
  try {
    await db.insert(epicRelations).values({
      id,
      epicId: blocker.id,
      relatedEpicId: blocked.id,
      type: kind === 'related' ? 'related' : 'blocks',
      createdById: authz.userId,
      createdAt: new Date(),
    });
  } catch (err) {
    if (isUniqueViolation(err)) return fail('These epics are already linked.');
    throw err;
  }

  await emitIssueEvent([
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
  ]);
  revalidate(projectId);
  return { ok: true, id };
}

export async function removeEpicRelation(input: {
  projectId: string;
  id: string;
}): Promise<EpicRelationActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  if (typeof input.id !== 'string' || !input.id) return fail('Dependency not found.');

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
  if (!relation) return fail('Dependency not found.');

  await db.delete(epicRelations).where(eq(epicRelations.id, relation.id));

  await emitIssueEvent([
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
  ]);
  revalidate(input.projectId);
  return { ok: true };
}
