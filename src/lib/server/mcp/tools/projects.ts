// list_projects, get_project_metadata, get_project_overview.

import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { tickets, workflowStates } from '@/db/schema';
import { cycleBurndown, cycleTotals, loadCycleHistory, type CycleRow } from '@/lib/cycles';
import { PRIORITY_ORDER } from '@/lib/issue-model';
import { activeIssue, queryIssues } from '@/lib/tickets';
import { openStateType } from '@/lib/workflow-server';
import { mcpProject, mcpProjects, type McpProject } from '../access';
import type { CycleView, ProjectListView, ProjectMetadataView, ProjectOverviewView } from '../contracts';
import { issueListMarkdown, projectRef, projectUrl, summarizeIssue, toolError, toolResult } from '../format';
import { cycleStatus, loadProjectMetadata } from '../resolve';
import { defineTool } from './common';

export const projectArg = z
  .string()
  .min(1)
  .max(100)
  .describe('Project key (e.g. "WEB") or project id.');

export const listProjects = defineTool({
  name: 'list_projects',
  title: 'List projects',
  description: 'List the projects (teams) you can access, with their issue key prefix and open issue count.',
  scope: 'read',
  input: z.object({}),
  invoking: 'Listing projects…',
  invoked: 'Listed projects',
  async run(_args, { userId }) {
    const projects = await mcpProjects(userId);
    const ids = projects.map((p) => p.id);
    const counts = ids.length
      ? await db
          .select({ projectId: tickets.projectId, n: count() })
          .from(tickets)
          .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
          .where(and(inArray(tickets.projectId, ids), activeIssue(), openStateType()))
          .groupBy(tickets.projectId)
      : [];
    const open = new Map(counts.map((c) => [c.projectId, Number(c.n)]));
    const view: ProjectListView = {
      view: 'project-list',
      projects: projects.map((p) => ({
        ...projectRef(p),
        description: p.description,
        role: p.role,
        workspace: p.workspace,
        openIssues: open.get(p.id) ?? 0,
        url: projectUrl(p.id),
      })),
    };
    const text = view.projects.length
      ? [
          `Projects (${view.projects.length}):`,
          ...view.projects.map(
            (p) =>
              `- **${p.key}** ${p.name}${p.workspace ? ` (workspace ${p.workspace.name})` : ''} — ${p.openIssues} open, your role: ${p.role}`,
          ),
        ].join('\n')
      : 'You have no projects reachable from AI assistants.';
    return toolResult(text, view);
  },
});

function cycleView(cycle: CycleRow, history: Awaited<ReturnType<typeof loadCycleHistory>>, now: Date): CycleView {
  const totals = cycleTotals(history, cycle, now);
  return {
    id: cycle.id,
    number: cycle.number,
    name: cycle.name,
    startsAt: cycle.startsAt.toISOString(),
    endsAt: cycle.endsAt.toISOString(),
    completedAt: cycle.completedAt?.toISOString() ?? null,
    status: cycleStatus(cycle, now),
    totals,
    burndown: cycleBurndown(history, cycle, now).map((p) => ({ at: p.at.toISOString(), totals: p.totals })),
  };
}

export function cycleText(cycle: CycleView): string {
  const t = cycle.totals;
  const name = `Cycle ${cycle.number}${cycle.name ? ` (${cycle.name})` : ''}`;
  return `${name}, ${cycle.status}, ${cycle.startsAt.slice(0, 10)} → ${cycle.endsAt.slice(0, 10)}: ${t.completed}/${t.scope} issues done, ${t.started} in progress (${t.completedPoints}/${t.scopePoints} points).`;
}

export async function loadCycleView(projectId: string, cycle: CycleRow, now = new Date()): Promise<CycleView> {
  return cycleView(cycle, await loadCycleHistory(projectId), now);
}

export const getProjectMetadata = defineTool({
  name: 'get_project_metadata',
  title: 'Get project metadata',
  description:
    'Get the workflow states, labels, members, cycles and epics of a project: the valid values for filters and for creating or updating issues.',
  scope: 'read',
  input: z.object({ project: projectArg }),
  invoking: 'Reading project settings…',
  invoked: 'Read project settings',
  async run({ project: ref }, { userId }) {
    const access = await mcpProject(userId, ref, 'read');
    if (!access.ok) return toolError(access.error);
    const { project } = access;
    const meta = await loadProjectMetadata(project.id);
    const now = new Date();
    // Data minimization: emails only to tell apart members who share a name.
    const nameCounts = new Map<string, number>();
    for (const m of meta.members) nameCounts.set(m.name.toLowerCase(), (nameCounts.get(m.name.toLowerCase()) ?? 0) + 1);
    const view: ProjectMetadataView = {
      view: 'project-metadata',
      project: projectRef(project),
      states: meta.states.map((s) => ({ id: s.id, name: s.name, type: s.type, color: s.color })),
      labels: meta.labels,
      members: meta.members.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        ...((nameCounts.get(m.name.toLowerCase()) ?? 0) > 1 && { email: m.email }),
      })),
      cycles: meta.cycles
        .filter((c) => cycleStatus(c, now) !== 'past')
        .map((c) => ({
          id: c.id,
          number: c.number,
          name: c.name,
          startsAt: c.startsAt.toISOString(),
          endsAt: c.endsAt.toISOString(),
          status: cycleStatus(c, now),
        })),
      epics: meta.epics,
      priorities: [...PRIORITY_ORDER],
    };
    const text = [
      `${project.name} (${project.key}) — your role: ${project.role}`,
      `States: ${view.states.map((s) => `${s.name} [${s.type}]`).join(', ')}`,
      `Labels: ${view.labels.map((l) => l.name).join(', ') || '(none)'}`,
      `Members: ${view.members.map((m) => (m.email ? `${m.name} <${m.email}>` : m.name)).join(', ')}`,
      `Current and upcoming cycles: ${view.cycles.map((c) => `${c.number}${c.name ? ` (${c.name})` : ''} [${c.status}]`).join(', ') || '(none)'}`,
      `Epics: ${view.epics.map((e) => e.name).join(', ') || '(none)'}`,
      `Priorities: ${view.priorities.join(', ')}`,
    ].join('\n');
    return toolResult(text, view);
  },
});

export async function stateTypeCounts(projectId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ type: workflowStates.type, n: count() })
    .from(tickets)
    .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
    .where(and(eq(tickets.projectId, projectId), isNull(tickets.deletedAt), isNull(tickets.archivedAt)))
    .groupBy(workflowStates.type);
  return Object.fromEntries(rows.map((r) => [r.type, Number(r.n)]));
}

export async function overviewFor(project: McpProject, cycle: CycleRow | null, mode: 'project' | 'cycle') {
  const now = new Date();
  const [counts, cycleData, issues] = await Promise.all([
    stateTypeCounts(project.id),
    cycle ? loadCycleView(project.id, cycle, now) : null,
    mode === 'cycle' && cycle
      ? queryIssues(and(eq(tickets.projectId, project.id), eq(tickets.cycleId, cycle.id), activeIssue(), openStateType()), {
          orderBy: [desc(tickets.updatedAt)],
          limit: 25,
        })
      : queryIssues(and(eq(tickets.projectId, project.id), activeIssue()), {
          orderBy: [desc(tickets.updatedAt)],
          limit: 10,
        }),
  ]);
  const ref = projectRef(project);
  const view: ProjectOverviewView = {
    view: 'project-overview',
    mode,
    project: { ...ref, url: projectUrl(project.id) },
    countsByStateType: counts,
    cycle: cycleData,
    issues: issues.map((i) => summarizeIssue(i, ref)),
  };
  return view;
}

export const getProjectOverview = defineTool({
  name: 'get_project_overview',
  title: 'Get project overview',
  description:
    'Summarize a project: issue counts by state type, progress of the current cycle and its burndown, and recently updated issues.',
  scope: 'read',
  input: z.object({ project: projectArg }),
  invoking: 'Summarizing the project…',
  invoked: 'Summarized the project',
  async run({ project: ref }, { userId }) {
    const access = await mcpProject(userId, ref, 'read');
    if (!access.ok) return toolError(access.error);
    const { project } = access;
    const meta = await loadProjectMetadata(project.id);
    const current = meta.cycles.find((c) => cycleStatus(c, new Date()) === 'current') ?? null;
    const view = await overviewFor(project, current, 'project');
    const counts = Object.entries(view.countsByStateType)
      .map(([type, n]) => `${type} ${n}`)
      .join(', ');
    const text = [
      `${project.name} (${project.key}) · ${view.project.url}`,
      `Issues by state: ${counts || 'none yet'}`,
      view.cycle ? cycleText(view.cycle) : 'No cycle is running.',
      '',
      issueListMarkdown('Recently updated', view.issues, null),
    ].join('\n');
    return toolResult(text, view);
  },
});
