// Asana → ImportRecords, with the user's personal access token (used for this
// request only, never stored). Server-only: called from the import actions.
//
// Tasks come from one project; subtasks (any depth) are fetched per task and
// follow their parent so the import can make them sub-issues. Completed tasks
// land in the first completed state, others in the state named like their
// section ("In Progress" → In Progress), else the default.

import { requestJson } from '@/lib/vcs/http';
import { EXTERNAL_IMPORT_CAP, type ImportLabel, type ImportRecord, type ImportSource } from './records';
import { summarize, type ExternalFetchResult } from './external';

const API = 'https://app.asana.com/api/1.0';
const TASK_FIELDS = [
  'name',
  'notes',
  'completed',
  'assignee.email',
  'due_on',
  'tags.name',
  'tags.color',
  'memberships.project.gid',
  'memberships.section.name',
  'permalink_url',
  'created_at',
  'num_subtasks',
].join(',');

interface Page<T> {
  data: T[];
  next_page: { offset: string } | null;
}

interface AsanaTask {
  gid: string;
  name: string;
  notes?: string | null;
  completed?: boolean;
  assignee?: { email?: string | null } | null;
  due_on?: string | null;
  tags?: { name?: string; color?: string | null }[];
  memberships?: { project?: { gid?: string }; section?: { name?: string } | null }[];
  permalink_url?: string;
  created_at?: string;
  num_subtasks?: number;
}

export interface AsanaOption {
  gid: string;
  name: string;
}

// Asana's named palette → hex (approximate).
const COLORS: Record<string, string> = {
  red: '#e8384f',
  orange: '#fd612c',
  'yellow-orange': '#fd9a00',
  yellow: '#eec300',
  'yellow-green': '#a4cf30',
  green: '#62d26f',
  'blue-green': '#37c5ab',
  aqua: '#20aaea',
  blue: '#4186e0',
  indigo: '#7a6ff0',
  purple: '#aa62e3',
  magenta: '#e362e3',
  'hot-pink': '#ea4e9d',
  pink: '#fc91ad',
  'cool-gray': '#8da3a6',
};

function tagColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const name = color.replace(/^(dark|light)-/, '');
  return COLORS[name] ?? (name === 'teal' ? COLORS['blue-green'] : name === 'brown' ? '#a36b40' : null);
}

async function get<T>(token: string, path: string): Promise<T> {
  return requestJson<T>(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 15_000 });
}

async function all<T>(token: string, path: string, max: number): Promise<T[]> {
  const out: T[] = [];
  let offset: string | null = null;
  do {
    const sep = path.includes('?') ? '&' : '?';
    const page: Page<T> = await get<Page<T>>(
      token,
      `${path}${sep}limit=100${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`,
    );
    out.push(...page.data);
    offset = page.next_page?.offset ?? null;
  } while (offset && out.length < max);
  return out;
}

export async function listAsanaWorkspaces(token: string): Promise<AsanaOption[]> {
  const rows = await all<AsanaOption>(token, '/workspaces?opt_fields=name', 500);
  return rows.map(({ gid, name }) => ({ gid, name }));
}

export async function listAsanaProjects(token: string, workspace: string): Promise<AsanaOption[]> {
  const rows = await all<AsanaOption>(
    token,
    `/workspaces/${encodeURIComponent(workspace)}/projects?archived=false&opt_fields=name`,
    1000,
  );
  return rows.map(({ gid, name }) => ({ gid, name })).sort((a, b) => a.name.localeCompare(b.name));
}

function toRecord(task: AsanaTask, projectGid: string, parent: ImportSource | null): ImportRecord {
  const section = task.memberships?.find((m) => m.project?.gid === projectGid)?.section?.name ?? null;
  const labels = new Map<string, ImportLabel>();
  for (const tag of task.tags ?? []) {
    const name = tag.name?.trim().slice(0, 40);
    if (name) labels.set(name.toLowerCase(), { name, color: tagColor(tag.color) });
  }
  return {
    title: task.name?.trim() || 'Untitled task',
    description: task.notes?.trim() || null,
    // "Untitled section" is Asana's default bucket, not a status.
    state: task.completed || !section || /^untitled section$/i.test(section) ? null : section,
    closed: !!task.completed,
    priority: null,
    assignee: task.assignee?.email ?? null,
    labels: [...labels.values()],
    estimate: null,
    dueDate: task.due_on && /^\d{4}-\d{2}-\d{2}$/.test(task.due_on) ? task.due_on : null,
    source: {
      kind: 'asana',
      id: task.gid,
      url: task.permalink_url ?? null,
      createdAt: task.created_at?.slice(0, 10) ?? null,
    },
    parent,
  };
}

export async function fetchAsanaTasks(
  token: string,
  projectGid: string,
  includeCompleted: boolean,
): Promise<ExternalFetchResult> {
  const filter = includeCompleted ? '' : '&completed_since=now';
  const top = await all<AsanaTask>(
    token,
    `/projects/${encodeURIComponent(projectGid)}/tasks?opt_fields=${TASK_FIELDS}${filter}`,
    EXTERNAL_IMPORT_CAP + 1,
  );

  const records: ImportRecord[] = [];
  let truncated = false;
  // Depth-first so every subtask directly follows its parent.
  const visit = async (task: AsanaTask, parent: ImportSource | null): Promise<void> => {
    if (records.length >= EXTERNAL_IMPORT_CAP) {
      truncated = true;
      return;
    }
    if (!includeCompleted && task.completed) return;
    const record = toRecord(task, projectGid, parent);
    records.push(record);
    if (!task.num_subtasks) return;
    const subtasks = await all<AsanaTask>(
      token,
      `/tasks/${encodeURIComponent(task.gid)}/subtasks?opt_fields=${TASK_FIELDS}`,
      EXTERNAL_IMPORT_CAP,
    );
    for (const subtask of subtasks) await visit(subtask, record.source);
  };
  for (const task of top) {
    await visit(task, null);
    if (truncated) break;
  }
  return summarize(records, truncated);
}
