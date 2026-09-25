// Project templates (.planning/features/D4a-project-templates.md): snapshot a
// project's setup into `project_template.config` and seed new projects from it.
// Server-only (imports db). No authorization here — callers check access.
//
// Snapshots store names, never ids: issue-template defaults reference states
// and labels by name and are re-mapped to the new project's rows on create.

import { and, asc, eq, inArray, or } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { db } from '@/lib/db';
import {
  issueTemplates,
  labels,
  projects,
  projectTemplates,
  workflowStates,
  workspaceMembers,
} from '@/db/schema';
import { isEstimateScale, type EstimateScale } from '@/lib/estimates';
import { isPriority, isStateType, type Priority, type StateType } from '@/lib/issue-model';
import { normalizeSlaPolicy } from '@/lib/sla';
import { workflowStateInserts } from '@/lib/workflow-server';

export interface TemplateState {
  name: string;
  type: StateType;
  color: string;
  position: number;
  description: string | null;
}

export interface TemplateLabel {
  name: string;
  color: string;
  description: string | null;
}

export interface TemplateSettings {
  estimateScale: EstimateScale;
  cyclesEnabled: boolean;
  cycleDurationWeeks: number;
  cycleAutoCreate: boolean;
  cycleStartWeekday: number;
  cycleAutoRollover: boolean;
  cycleCooldownWeeks: number;
  triageEnabled: boolean;
  autoArchiveMonths: number | null;
  autoCloseMonths: number | null;
  slaPolicy: Record<string, number>;
}

export interface TemplateIssueDefaults {
  stateName?: string;
  priority?: Priority;
  labelNames?: string[];
  estimate?: number;
}

export interface TemplateIssueTemplate {
  name: string;
  title: string;
  description: string | null;
  data: TemplateIssueDefaults;
}

export interface ProjectTemplateConfig {
  version: 1;
  states: TemplateState[];
  labels: TemplateLabel[];
  settings: TemplateSettings;
  issueTemplates: TemplateIssueTemplate[];
}

export const TEMPLATE_LIMITS = { states: 50, labels: 200, issueTemplates: 100 } as const;

const DEFAULT_SETTINGS: TemplateSettings = {
  estimateScale: 'none',
  cyclesEnabled: false,
  cycleDurationWeeks: 2,
  cycleAutoCreate: true,
  cycleStartWeekday: 1,
  cycleAutoRollover: true,
  cycleCooldownWeeks: 0,
  triageEnabled: false,
  autoArchiveMonths: 6,
  autoCloseMonths: null,
  slaPolicy: {},
};

// ---------------------------------------------------------------------------
// Sanitizing (configs are jsonb — never trust their shape)
// ---------------------------------------------------------------------------

const str = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null;

const optStr = (value: unknown, max: number): string | null =>
  typeof value === 'string' ? value.trim().slice(0, max) || null : null;

const int = (value: unknown, min: number, max: number): number | null =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max
    ? (value as number)
    : null;

const list = (value: unknown, max: number): unknown[] =>
  Array.isArray(value) ? value.slice(0, max) : [];

/** Drops anything malformed; duplicate names keep the first. */
export function normalizeTemplateConfig(raw: unknown): ProjectTemplateConfig {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const seenStates = new Set<string>();
  const states: TemplateState[] = [];
  for (const item of list(input.states, TEMPLATE_LIMITS.states)) {
    const s = (item ?? {}) as Record<string, unknown>;
    const name = str(s.name, 50);
    const color = str(s.color, 32);
    if (!name || !color || !isStateType(s.type) || seenStates.has(name.toLowerCase())) continue;
    seenStates.add(name.toLowerCase());
    states.push({
      name,
      type: s.type,
      color,
      position: typeof s.position === 'number' && Number.isFinite(s.position) ? s.position : states.length,
      description: optStr(s.description, 500),
    });
  }

  const seenLabels = new Set<string>();
  const labelList: TemplateLabel[] = [];
  for (const item of list(input.labels, TEMPLATE_LIMITS.labels)) {
    const l = (item ?? {}) as Record<string, unknown>;
    const name = str(l.name, 50);
    const color = str(l.color, 32);
    if (!name || !color || seenLabels.has(name.toLowerCase())) continue;
    seenLabels.add(name.toLowerCase());
    labelList.push({ name, color, description: optStr(l.description, 500) });
  }

  const s = (input.settings ?? {}) as Record<string, unknown>;
  const bool = (key: keyof TemplateSettings) =>
    typeof s[key] === 'boolean' ? (s[key] as boolean) : (DEFAULT_SETTINGS[key] as boolean);
  const months = (key: 'autoArchiveMonths' | 'autoCloseMonths') =>
    s[key] === null ? null : (int(s[key], 1, 120) ?? DEFAULT_SETTINGS[key]);
  const settings: TemplateSettings = {
    estimateScale: isEstimateScale(s.estimateScale) ? s.estimateScale : 'none',
    cyclesEnabled: bool('cyclesEnabled'),
    cycleDurationWeeks: int(s.cycleDurationWeeks, 1, 8) ?? DEFAULT_SETTINGS.cycleDurationWeeks,
    cycleAutoCreate: bool('cycleAutoCreate'),
    cycleStartWeekday: int(s.cycleStartWeekday, 0, 6) ?? DEFAULT_SETTINGS.cycleStartWeekday,
    cycleAutoRollover: bool('cycleAutoRollover'),
    cycleCooldownWeeks: int(s.cycleCooldownWeeks, 0, 8) ?? DEFAULT_SETTINGS.cycleCooldownWeeks,
    triageEnabled: bool('triageEnabled'),
    autoArchiveMonths: months('autoArchiveMonths'),
    autoCloseMonths: months('autoCloseMonths'),
    slaPolicy: normalizeSlaPolicy(s.slaPolicy) ?? {},
  };

  const templates: TemplateIssueTemplate[] = [];
  for (const item of list(input.issueTemplates, TEMPLATE_LIMITS.issueTemplates)) {
    const t = (item ?? {}) as Record<string, unknown>;
    const name = str(t.name, 60);
    if (!name) continue;
    const d = (t.data ?? {}) as Record<string, unknown>;
    const data: TemplateIssueDefaults = {};
    const stateName = str(d.stateName, 50);
    if (stateName) data.stateName = stateName;
    if (isPriority(d.priority)) data.priority = d.priority;
    const labelNames = list(d.labelNames, 50)
      .map((n) => str(n, 50))
      .filter((n): n is string => n !== null);
    if (labelNames.length) data.labelNames = labelNames;
    if (Number.isInteger(d.estimate)) data.estimate = d.estimate as number;
    templates.push({
      name,
      title: typeof t.title === 'string' ? t.title.slice(0, 200) : '',
      description: optStr(t.description, 10_000),
      data,
    });
  }

  return { version: 1, states, labels: labelList, settings, issueTemplates: templates };
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/** The project's setup as a template config; null when the project is gone. */
export async function snapshotProject(projectId: string): Promise<ProjectTemplateConfig | null> {
  const [projectRows, stateRows, labelRows, templateRows] = await db.batch([
    db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
    db
      .select()
      .from(workflowStates)
      .where(eq(workflowStates.projectId, projectId))
      .orderBy(asc(workflowStates.position)),
    db.select().from(labels).where(eq(labels.projectId, projectId)).orderBy(asc(labels.name)),
    db
      .select()
      .from(issueTemplates)
      .where(eq(issueTemplates.projectId, projectId))
      .orderBy(asc(issueTemplates.name)),
  ]);
  const [project] = projectRows;
  if (!project) return null;

  const stateName = new Map(stateRows.map((s) => [s.id, s.name]));
  const labelName = new Map(labelRows.map((l) => [l.id, l.name]));
  return normalizeTemplateConfig({
    states: stateRows,
    labels: labelRows,
    settings: project,
    issueTemplates: templateRows.map((t) => {
      const d = t.data ?? {};
      const labelIds = Array.isArray(d.labelIds) ? (d.labelIds as unknown[]) : [];
      return {
        name: t.name,
        title: t.title,
        description: t.description,
        data: {
          stateName: typeof d.stateId === 'string' ? stateName.get(d.stateId) : undefined,
          priority: d.priority,
          labelNames: labelIds.map((id) => (typeof id === 'string' ? labelName.get(id) : undefined)),
          estimate: d.estimate,
        },
      };
    }),
  });
}

export function templateSummary(config: ProjectTemplateConfig) {
  return {
    states: config.states.length,
    labels: config.labels.length,
    issueTemplates: config.issueTemplates.length,
    estimateScale: config.settings.estimateScale,
    cyclesEnabled: config.settings.cyclesEnabled,
    triageEnabled: config.settings.triageEnabled,
    sla: Object.keys(config.settings.slaPolicy).length > 0,
  };
}

// ---------------------------------------------------------------------------
// Seeding a new project
// ---------------------------------------------------------------------------

/**
 * Project column values + the rows a new project gets from `config` (states,
 * labels, issue templates). Without a config, or one with no valid states, the
 * project gets the default workflow. Put the project insert FIRST in the batch,
 * then these statements.
 */
export function projectSeed(
  projectId: string,
  now: Date,
  config: ProjectTemplateConfig | null,
  createdById: string,
): { settings: Partial<typeof projects.$inferInsert>; statements: BatchItem<'pg'>[] } {
  const statements: BatchItem<'pg'>[] = [];
  const stateIds = new Map<string, string>();

  if (config && config.states.length > 0) {
    const rows = config.states.map((s) => {
      const id = crypto.randomUUID();
      stateIds.set(s.name.toLowerCase(), id);
      return { id, projectId, ...s, createdAt: now };
    });
    statements.push(db.insert(workflowStates).values(rows));
  } else {
    statements.push(db.insert(workflowStates).values(workflowStateInserts(projectId, now)));
  }
  if (!config) return { settings: {}, statements };

  const labelIds = new Map<string, string>();
  if (config.labels.length) {
    const rows = config.labels.map((l) => {
      const id = crypto.randomUUID();
      labelIds.set(l.name.toLowerCase(), id);
      return { id, projectId, ...l, createdAt: now };
    });
    statements.push(db.insert(labels).values(rows));
  }

  if (config.issueTemplates.length) {
    statements.push(
      db.insert(issueTemplates).values(
        config.issueTemplates.map((t) => {
          const data: Record<string, unknown> = {};
          const stateId = t.data.stateName && stateIds.get(t.data.stateName.toLowerCase());
          if (stateId) data.stateId = stateId;
          if (t.data.priority) data.priority = t.data.priority;
          const ids = (t.data.labelNames ?? [])
            .map((name) => labelIds.get(name.toLowerCase()))
            .filter((id): id is string => !!id);
          if (ids.length) data.labelIds = ids;
          if (t.data.estimate !== undefined) data.estimate = t.data.estimate;
          return {
            id: crypto.randomUUID(),
            projectId,
            name: t.name,
            title: t.title,
            description: t.description,
            data,
            createdById,
            createdAt: now,
            updatedAt: now,
          };
        }),
      ),
    );
  }

  return { settings: { ...config.settings }, statements };
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/** Templates `userId` may use: their own + ones shared with a workspace they're in. */
export function usableTemplateFilter(userId: string) {
  return or(
    eq(projectTemplates.ownerId, userId),
    inArray(
      projectTemplates.workspaceId,
      db
        .select({ id: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, userId)),
    ),
  )!;
}

/** The template's normalized config when `userId` may use it; null otherwise. */
export async function getUsableTemplateConfig(
  templateId: string,
  userId: string,
): Promise<ProjectTemplateConfig | null> {
  if (!templateId || !userId) return null;
  const [row] = await db
    .select({ config: projectTemplates.config })
    .from(projectTemplates)
    .where(and(eq(projectTemplates.id, templateId), usableTemplateFilter(userId)))
    .limit(1);
  return row ? normalizeTemplateConfig(row.config) : null;
}
