// Server-only (imports db): sanitize the stored property defaults of drafts and
// templates. Callers authorize first; this checks the shape and that every
// referenced id belongs to the project, dropping anything that doesn't — drafts
// autosave and must never fail on a stale id.

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  cycles,
  epics,
  labels,
  milestones,
  projectMembers,
  projects,
  tickets,
  workflowStates,
} from '@/db/schema';
import { isDateString } from '@/lib/dates';
import { isValidEstimate } from '@/lib/estimates';
import { isPriority, type IssuePatch } from '@/lib/issue-model';

export const DEFAULT_FIELDS = [
  'stateId',
  'priority',
  'assigneeId',
  'labelIds',
  'estimate',
  'dueDate',
  'parentId',
  'cycleId',
  'epicId',
  'milestoneId',
] as const;

export type DefaultField = (typeof DEFAULT_FIELDS)[number];
export type IssueDefaults = Pick<IssuePatch, DefaultField>;

/** Template defaults: the properties a template editor offers. */
export const TEMPLATE_FIELDS = ['stateId', 'priority', 'assigneeId', 'labelIds', 'estimate'] as const;

const NOTHING = sql`false`;
const LABELS_MAX = 50;

const idOrNull = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && value.length > 0 && value.length <= 100);

export async function sanitizeIssueDefaults(
  projectId: string,
  raw: unknown,
  fields: readonly DefaultField[] = DEFAULT_FIELDS,
): Promise<IssueDefaults> {
  if (!raw || typeof raw !== 'object') return {};
  const input = raw as Record<string, unknown>;
  const allowed = new Set<string>(fields);
  const pick = (field: DefaultField) => (allowed.has(field) ? input[field] : undefined);
  const out: IssueDefaults = {};

  const stateId = pick('stateId');
  const assigneeId = pick('assigneeId');
  const parentId = pick('parentId');
  const cycleId = pick('cycleId');
  const epicId = pick('epicId');
  const milestoneId = pick('milestoneId');
  const rawLabels = pick('labelIds');
  const labelIds = Array.isArray(rawLabels)
    ? [...new Set(rawLabels.filter((id): id is string => idOrNull(id) && id !== null))].slice(
        0,
        LABELS_MAX,
      )
    : undefined;

  const priority = pick('priority');
  if (isPriority(priority)) out.priority = priority;
  const dueDate = pick('dueDate');
  if (dueDate === null || isDateString(dueDate)) out.dueDate = dueDate;
  if (labelIds && labelIds.length === 0) out.labelIds = [];
  // null = explicitly "none"; nothing to check.
  for (const [field, value] of [
    ['assigneeId', assigneeId],
    ['parentId', parentId],
    ['cycleId', cycleId],
    ['epicId', epicId],
    ['milestoneId', milestoneId],
  ] as const) {
    if (value === null) out[field] = null;
  }

  const str = (value: unknown) => (typeof value === 'string' && idOrNull(value) ? value : null);
  const [projectRows, stateRows, labelRows, memberRows, parentRows, cycleRows, epicRows, milestoneRows] =
    await db.batch([
      db
        .select({ estimateScale: projects.estimateScale })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1),
      db
        .select({ id: workflowStates.id })
        .from(workflowStates)
        .where(
          str(stateId)
            ? and(eq(workflowStates.projectId, projectId), eq(workflowStates.id, str(stateId)!))
            : NOTHING,
        ),
      db
        .select({ id: labels.id })
        .from(labels)
        .where(
          labelIds?.length
            ? and(eq(labels.projectId, projectId), inArray(labels.id, labelIds))
            : NOTHING,
        ),
      db
        .select({ id: projectMembers.userId })
        .from(projectMembers)
        .where(
          str(assigneeId)
            ? and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, str(assigneeId)!))
            : NOTHING,
        ),
      db
        .select({ id: tickets.id })
        .from(tickets)
        .where(
          str(parentId)
            ? and(
                eq(tickets.projectId, projectId),
                eq(tickets.id, str(parentId)!),
                isNull(tickets.deletedAt),
              )
            : NOTHING,
        ),
      db
        .select({ id: cycles.id })
        .from(cycles)
        .where(
          str(cycleId) ? and(eq(cycles.projectId, projectId), eq(cycles.id, str(cycleId)!)) : NOTHING,
        ),
      db
        .select({ id: epics.id })
        .from(epics)
        .where(
          str(epicId) ? and(eq(epics.projectId, projectId), eq(epics.id, str(epicId)!)) : NOTHING,
        ),
      db
        .select({ id: milestones.id, epicId: milestones.epicId })
        .from(milestones)
        .innerJoin(epics, eq(milestones.epicId, epics.id))
        .where(
          str(milestoneId)
            ? and(eq(epics.projectId, projectId), eq(milestones.id, str(milestoneId)!))
            : NOTHING,
        ),
    ]);

  if (stateRows[0]) out.stateId = stateRows[0].id;
  if (labelRows.length) {
    const found = new Set(labelRows.map((l) => l.id));
    out.labelIds = labelIds!.filter((id) => found.has(id));
  }
  if (memberRows[0]) out.assigneeId = memberRows[0].id;
  if (parentRows[0]) out.parentId = parentRows[0].id;
  if (cycleRows[0]) out.cycleId = cycleRows[0].id;
  if (epicRows[0]) out.epicId = epicRows[0].id;
  const milestone = milestoneRows[0];
  if (milestone && (!out.epicId || out.epicId === milestone.epicId)) out.milestoneId = milestone.id;

  const estimate = pick('estimate');
  const scale = projectRows[0]?.estimateScale ?? 'none';
  if (estimate === null) out.estimate = null;
  else if (Number.isInteger(estimate) && isValidEstimate(scale, estimate as number)) {
    out.estimate = estimate as number;
  }
  return out;
}
