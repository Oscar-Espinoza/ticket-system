// Human values → ids, within one project the caller already passed through
// ./access.ts. Models send names ("In Progress", "me", "bug", "Cycle 4"); the
// issue service takes ids and re-validates every one against the project, so
// this only translates. A failure lists the valid options, so the model can
// correct itself without another round trip.

import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { cycles, epics, labels, projectMembers, users } from '@/db/schema';
import { isCurrentCycle, type CycleRow } from '@/lib/cycles';
import { isStateType } from '@/lib/issue-model';
import { projectStatesQuery } from '@/lib/workflow-server';
import { sortStates } from '@/lib/workflow';
import type { ProjectRole } from '@/lib/roles';

export interface ProjectMetadata {
  states: { id: string; name: string; type: string; color: string; position: number }[];
  labels: { id: string; name: string; color: string }[];
  members: { id: string; name: string; email: string; role: ProjectRole }[];
  cycles: CycleRow[];
  epics: { id: string; name: string }[];
}

export async function loadProjectMetadata(projectId: string): Promise<ProjectMetadata> {
  const [states, labelRows, members, cycleRows, epicRows] = await db.batch([
    projectStatesQuery(projectId),
    db
      .select({ id: labels.id, name: labels.name, color: labels.color })
      .from(labels)
      .where(eq(labels.projectId, projectId))
      .orderBy(asc(labels.name)),
    db
      .select({ id: users.id, name: users.name, email: users.email, role: projectMembers.role })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(asc(users.name)),
    db
      .select()
      .from(cycles)
      .where(eq(cycles.projectId, projectId))
      .orderBy(asc(cycles.startsAt), asc(cycles.number)),
    db
      .select({ id: epics.id, name: epics.name })
      .from(epics)
      .where(and(eq(epics.projectId, projectId), isNull(epics.archivedAt)))
      .orderBy(asc(epics.sortOrder), asc(epics.name)),
  ]);
  return { states: sortStates(states), labels: labelRows, members, cycles: cycleRows, epics: epicRows };
}

export type Resolved<T> = { ok: true; value: T } | { ok: false; error: string };

const lower = (s: string) => s.trim().toLowerCase();
const list = (values: string[]) => values.map((v) => `"${v}"`).join(', ');
const NONE = new Set(['none', 'null', 'unassigned', '']);

/** A state by id, name (case-insensitive) or type (the first state of that type). */
export function resolveState(meta: ProjectMetadata, input: string): Resolved<string> {
  const value = lower(input);
  const match =
    meta.states.find((s) => s.id === input) ??
    meta.states.find((s) => lower(s.name) === value) ??
    (isStateType(value) ? meta.states.find((s) => s.type === value) : undefined);
  if (match) return { ok: true, value: match.id };
  return { ok: false, error: `Unknown state "${input}". Valid states: ${list(meta.states.map((s) => s.name))}.` };
}

/** `me`, `none`, or a member by id, email or name (case-insensitive). */
export function resolveAssignee(meta: ProjectMetadata, viewerId: string, input: string | null): Resolved<string | null> {
  if (input === null || NONE.has(lower(input))) return { ok: true, value: null };
  const value = lower(input);
  if (value === 'me') {
    return meta.members.some((m) => m.id === viewerId)
      ? { ok: true, value: viewerId }
      : { ok: false, error: 'You are not a member of this project.' };
  }
  const byId = meta.members.find((m) => m.id === input) ?? meta.members.find((m) => lower(m.email) === value);
  if (byId) return { ok: true, value: byId.id };
  const byName = meta.members.filter((m) => lower(m.name) === value);
  if (byName.length === 1) return { ok: true, value: byName[0].id };
  if (byName.length > 1) {
    return {
      ok: false,
      error: `Several members are named "${input}"; pass an email instead: ${list(byName.map((m) => m.email))}.`,
    };
  }
  return {
    ok: false,
    error: `"${input}" is not a member of this project. Members: ${list(meta.members.map((m) => m.name))}, or "me" / "none".`,
  };
}

/** Labels by id or name (case-insensitive); all must exist. */
export function resolveLabels(meta: ProjectMetadata, inputs: string[]): Resolved<string[]> {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const input of inputs) {
    const label = meta.labels.find((l) => l.id === input) ?? meta.labels.find((l) => lower(l.name) === lower(input));
    if (label) {
      if (!ids.includes(label.id)) ids.push(label.id);
    } else unknown.push(input);
  }
  if (unknown.length === 0) return { ok: true, value: ids };
  return {
    ok: false,
    error: `Unknown label${unknown.length > 1 ? 's' : ''} ${list(unknown)}. Valid labels: ${
      meta.labels.length ? list(meta.labels.map((l) => l.name)) : '(none in this project)'
    }.`,
  };
}

function cycleStatus(cycle: CycleRow, now: Date): 'current' | 'upcoming' | 'past' {
  if (isCurrentCycle(cycle, now)) return 'current';
  return cycle.startsAt > now ? 'upcoming' : 'past';
}

export { cycleStatus };

const cycleLabel = (c: CycleRow) => (c.name ? `${c.number} (${c.name})` : String(c.number));

/** A cycle by id, number ("4" or "Cycle 4"), name, `current`, `next` or `none`. */
export function resolveCycle(meta: ProjectMetadata, input: string | null, now = new Date()): Resolved<string | null> {
  if (input === null || NONE.has(lower(input))) return { ok: true, value: null };
  const value = lower(input);
  let match: CycleRow | undefined;
  if (value === 'current') match = meta.cycles.find((c) => cycleStatus(c, now) === 'current');
  else if (value === 'next') match = meta.cycles.find((c) => cycleStatus(c, now) === 'upcoming');
  else {
    const number = /^(?:cycle\s*)?(\d{1,6})$/.exec(value)?.[1];
    match =
      meta.cycles.find((c) => c.id === input) ??
      (number ? meta.cycles.find((c) => c.number === Number(number)) : undefined) ??
      meta.cycles.find((c) => c.name && lower(c.name) === value);
  }
  if (match) return { ok: true, value: match.id };
  const open = meta.cycles.filter((c) => cycleStatus(c, now) !== 'past');
  return {
    ok: false,
    error: open.length
      ? `Unknown cycle "${input}". Current and upcoming cycles: ${open.map(cycleLabel).join(', ')}, or "current" / "next" / "none".`
      : `Unknown cycle "${input}": this project has no current or upcoming cycles.`,
  };
}

/** An epic by id or name (case-insensitive), or `none`. */
export function resolveEpic(meta: ProjectMetadata, input: string | null): Resolved<string | null> {
  if (input === null || NONE.has(lower(input))) return { ok: true, value: null };
  const match = meta.epics.find((e) => e.id === input) ?? meta.epics.find((e) => lower(e.name) === lower(input));
  if (match) return { ok: true, value: match.id };
  return {
    ok: false,
    error: `Unknown epic "${input}". ${meta.epics.length ? `Epics: ${list(meta.epics.map((e) => e.name))}.` : 'This project has no epics.'}`,
  };
}
