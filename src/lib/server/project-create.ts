// Creating a project: validation, then one batch that inserts the project, its
// owner membership and its seed (default workflow states, or a template's
// states, labels, settings and issue templates) — no ownerless or stateless
// project is ever visible.

import { m } from '@/lib/i18n';
import { projectMembers, projects, workflowStates } from '@/db/schema';
import { fail, type Fail } from '@/lib/server/action-kit';
import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db-errors';
import { getUsableTemplateConfig, projectSeed } from '@/lib/project-templates';
import { workflowStateInserts } from '@/lib/workflow-server';

const NAME_MAX = 100;
const KEY_RE = /^[A-Z]{2,6}$/;

/**
 * The default workflow states, named in the creator's language (the request
 * locale). They are stored data from here on: never translated on display.
 */
function localizedDefaultStates(projectId: string, now: Date) {
  const names: Record<string, () => string> = {
    Triage: m.projects_default_state_triage,
    Backlog: m.projects_default_state_backlog,
    Todo: m.projects_default_state_todo,
    'In Progress': m.projects_default_state_in_progress,
    'In Review': m.projects_default_state_in_review,
    Done: m.projects_default_state_done,
    Canceled: m.projects_default_state_canceled,
    Duplicate: m.projects_default_state_duplicate,
  };
  return workflowStateInserts(projectId, now).map((state) => ({
    ...state,
    name: names[state.name]?.() ?? state.name,
  }));
}

export const projectNameError = (name: string): string | null =>
  !name
    ? m.projects_err_project_name_required()
    : name.length > NAME_MAX
      ? m.projects_err_project_name_max({ max: NAME_MAX })
      : null;

export const projectKeyError = (ticketKey: string): string | null =>
  KEY_RE.test(ticketKey) ? null : m.projects_err_project_key();

export type CreateProjectErrors = {
  name?: string;
  ticketKey?: string;
  templateId?: string;
};

/** The first error in form order, as an action failure naming its field. */
export function firstProjectError(errors: CreateProjectErrors): Fail<keyof CreateProjectErrors> {
  for (const field of ['name', 'ticketKey', 'templateId'] as const) {
    const error = errors[field];
    if (error) return fail(error, field);
  }
  return fail(m.projects_err_project_create_failed());
}

export type CreateProjectOutcome =
  | { ok: true; projectId: string }
  | { ok: false; errors: CreateProjectErrors };

/**
 * `name`, `ticketKey` and `templateId` are already trimmed text. A template is
 * re-checked here (own, or shared with one of the creator's workspaces).
 */
export async function createProjectRecord(input: {
  userId: string;
  name: string;
  ticketKey: string;
  templateId: string;
  workspaceId?: string;
}): Promise<CreateProjectOutcome> {
  const { userId, name, ticketKey, templateId, workspaceId } = input;

  const errors: CreateProjectErrors = {};
  const nameError = projectNameError(name);
  if (nameError) errors.name = nameError;
  const keyError = projectKeyError(ticketKey);
  if (keyError) errors.ticketKey = keyError;
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const template = templateId ? await getUsableTemplateConfig(templateId, userId) : null;
  if (templateId && !template) {
    return { ok: false, errors: { templateId: m.projects_err_template_unavailable() } };
  }

  const projectId = crypto.randomUUID();
  const now = new Date();
  const seed = projectSeed(projectId, now, template, userId);
  // Without a template, projectSeed's first statement inserts the default states in English.
  if (!template) seed.statements[0] = db.insert(workflowStates).values(localizedDefaultStates(projectId, now));
  try {
    await db.batch([
      db.insert(projects).values({
        id: projectId,
        name,
        ticketKey,
        ticketCounter: 0,
        ownerId: userId,
        ...(workspaceId ? { workspaceId } : {}),
        ...seed.settings,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(projectMembers).values({
        id: crypto.randomUUID(),
        projectId,
        userId,
        role: 'owner',
        createdAt: now,
      }),
      ...seed.statements,
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, errors: { ticketKey: m.projects_err_key_in_use() } };
    }
    throw err;
  }
  return { ok: true, projectId };
}
