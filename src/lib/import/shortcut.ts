// Shortcut → ImportRecords, with the user's API token (used for this request
// only, never stored). Server-only: called from the import actions.
//
// Stories come from one workflow (searched per workflow state) or one
// project. Done-type states land in the first completed state, others in the
// state named like theirs. Owners map to members by email; sub-task stories
// (`parent_story_id`) become sub-issues, ordered after their parent.

import { requestJson } from '@/lib/vcs/http';
import { summarize, type ExternalFetchResult } from './external';
import { EXTERNAL_IMPORT_CAP, type ImportLabel, type ImportRecord } from './records';

const API = 'https://api.app.shortcut.com/api/v3';

interface ShortcutState {
  id: number;
  name: string;
  type: string;
}

interface ShortcutWorkflow {
  id: number;
  name: string;
  states: ShortcutState[];
}

interface ShortcutStory {
  id: number;
  name: string;
  description?: string | null;
  workflow_state_id?: number;
  completed?: boolean;
  archived?: boolean;
  owner_ids?: string[];
  labels?: { name?: string; color?: string | null }[];
  deadline?: string | null;
  estimate?: number | null;
  app_url?: string;
  created_at?: string;
  parent_story_id?: number | null;
}

export interface ShortcutOption {
  id: number;
  name: string;
}

function request<T>(token: string, path: string, body?: unknown): Promise<T> {
  return requestJson<T>(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Shortcut-Token': token },
    timeoutMs: 20_000,
  });
}

export async function listShortcutSources(
  token: string,
): Promise<{ workflows: ShortcutOption[]; projects: ShortcutOption[] }> {
  const [workflows, projects] = await Promise.all([
    request<ShortcutWorkflow[]>(token, '/workflows'),
    // Projects are optional in Shortcut (older workspaces); an error here just means none.
    request<{ id: number; name: string; archived?: boolean }[]>(token, '/projects').catch(() => []),
  ]);
  return {
    workflows: workflows.map(({ id, name }) => ({ id, name })),
    projects: projects.filter((p) => !p.archived).map(({ id, name }) => ({ id, name })),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Parents before children, keeping the original order otherwise. */
function parentsFirst(stories: ShortcutStory[]): ShortcutStory[] {
  const ids = new Set(stories.map((s) => s.id));
  const children = new Map<number, ShortcutStory[]>();
  const roots: ShortcutStory[] = [];
  for (const story of stories) {
    const parent = story.parent_story_id;
    if (parent && ids.has(parent) && parent !== story.id) {
      children.set(parent, [...(children.get(parent) ?? []), story]);
    } else {
      roots.push(story);
    }
  }
  const out: ShortcutStory[] = [];
  const seen = new Set<number>();
  const visit = (story: ShortcutStory) => {
    if (seen.has(story.id)) return;
    seen.add(story.id);
    out.push(story);
    for (const child of children.get(story.id) ?? []) visit(child);
  };
  roots.forEach(visit);
  // Cycles (shouldn't happen) still import, just without the ordering guarantee.
  for (const story of stories) visit(story);
  return out;
}

export async function fetchShortcutStories(
  token: string,
  source: { kind: 'workflow' | 'project'; id: number },
  includeCompleted: boolean,
): Promise<ExternalFetchResult> {
  const [workflows, members] = await Promise.all([
    request<ShortcutWorkflow[]>(token, '/workflows'),
    request<{ id: string; profile?: { email_address?: string | null } }[]>(token, '/members'),
  ]);
  const states = new Map<number, ShortcutState>(workflows.flatMap((w) => w.states.map((s) => [s.id, s])));
  const emails = new Map(members.map((m) => [m.id, m.profile?.email_address ?? null]));

  let stories: ShortcutStory[] = [];
  const search = (filter: Record<string, unknown>) =>
    request<ShortcutStory[]>(token, '/stories/search', { ...filter, archived: false, includes_description: true });
  if (source.kind === 'project') {
    stories = await search({ project_ids: [source.id] });
  } else {
    const workflow = workflows.find((w) => w.id === source.id);
    if (!workflow) return summarize([], false);
    for (const state of workflow.states) {
      if (!includeCompleted && state.type === 'done') continue;
      stories.push(...(await search({ workflow_state_id: state.id })));
      if (stories.length > EXTERNAL_IMPORT_CAP) break;
    }
  }

  const done = (story: ShortcutStory) =>
    !!story.completed || states.get(story.workflow_state_id ?? -1)?.type === 'done';
  const wanted = stories.filter((story) => !story.archived && (includeCompleted || !done(story)));
  const truncated = wanted.length > EXTERNAL_IMPORT_CAP;
  // Cap first so a kept child's parent is only referenced when it's kept too.
  const kept = parentsFirst(wanted.sort((a, b) => a.id - b.id)).slice(0, EXTERNAL_IMPORT_CAP);
  const keptIds = new Set(kept.map((s) => s.id));

  const sourceOf = (story: ShortcutStory) => ({
    kind: 'shortcut' as const,
    id: `sc-${story.id}`,
    url: story.app_url ?? null,
    createdAt: story.created_at?.slice(0, 10) ?? null,
  });
  const byId = new Map(kept.map((s) => [s.id, s]));

  const records: ImportRecord[] = kept.map((story) => {
    const labels = new Map<string, ImportLabel>();
    for (const label of story.labels ?? []) {
      const name = label.name?.trim().slice(0, 40);
      if (name) labels.set(name.toLowerCase(), { name, color: label.color && HEX.test(label.color) ? label.color : null });
    }
    const isDone = done(story);
    const parentId = story.parent_story_id;
    const parent = parentId && keptIds.has(parentId) ? sourceOf(byId.get(parentId)!) : null;
    const owner = story.owner_ids?.[0];
    return {
      title: story.name?.trim() || `Story ${story.id}`,
      description: story.description?.trim() || null,
      state: isDone ? null : (states.get(story.workflow_state_id ?? -1)?.name ?? null),
      closed: isDone,
      priority: null,
      assignee: (owner && emails.get(owner)) || null,
      labels: [...labels.values()],
      estimate: typeof story.estimate === 'number' ? story.estimate : null,
      dueDate: story.deadline && /^\d{4}-\d{2}-\d{2}/.test(story.deadline) ? story.deadline.slice(0, 10) : null,
      source: sourceOf(story),
      parent,
    };
  });
  return summarize(records, truncated);
}
