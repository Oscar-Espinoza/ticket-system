// Creating a project: validation, then one batch that inserts the project, its
// owner membership and its seed (default workflow states, or a template's
// states, labels, settings and issue templates) — no ownerless or stateless
// project is ever visible.

import { projectMembers, projects } from '@/db/schema';
import { fail, type Fail } from '@/lib/server/action-kit';
import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db-errors';
import { getUsableTemplateConfig, projectSeed } from '@/lib/project-templates';

const NAME_MAX = 100;
const KEY_RE = /^[A-Z]{2,6}$/;

export const projectNameError = (name: string): string | null =>
  !name
    ? 'Project name is required.'
    : name.length > NAME_MAX
      ? `Project name must be ${NAME_MAX} characters or fewer.`
      : null;

export const projectKeyError = (ticketKey: string): string | null =>
  KEY_RE.test(ticketKey) ? null : 'Key must be 2–6 uppercase letters.';

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
  return fail('Could not create the project.');
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
    return { ok: false, errors: { templateId: 'That template is no longer available.' } };
  }

  const projectId = crypto.randomUUID();
  const now = new Date();
  const seed = projectSeed(projectId, now, template, userId);
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
      return { ok: false, errors: { ticketKey: 'This key is already in use. Choose a different one.' } };
    }
    throw err;
  }
  return { ok: true, projectId };
}
