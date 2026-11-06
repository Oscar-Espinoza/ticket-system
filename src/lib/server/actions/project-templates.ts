// Project templates: save a project's setup (states, labels, estimates,
// cycles / triage / automation settings, SLA policy, issue templates) and reuse
// it when creating projects. Saving needs project admin; a template is private
// to its owner unless shared with a workspace the owner belongs to, whose
// members may then use (not edit) it. Only the owner edits or deletes.

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectTemplates } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import {
  readProjectTemplates,
  snapshotProject,
  type ProjectTemplateRow,
} from '@/lib/project-templates';
import {
  fail,
  isFail,
  NOT_AUTHENTICATED,
  optionalText,
  refreshesData,
  requiredText,
  type ActionResult,
} from '@/lib/server/action-kit';
import { getSession } from '@/lib/session';
import { getWorkspaceMembership } from '@/lib/workspace-access';

export type { ProjectTemplateRow };

type Field = 'name' | 'description' | 'workspaceId' | 'projectId';
export type ProjectTemplateResult = ActionResult<{ template?: ProjectTemplateRow }, Field>;

const NAME_MAX = 60;
const DESCRIPTION_MAX = 500;
const NOT_FOUND = fail('Template not found.');

function validate(input: { name?: unknown; description?: unknown }) {
  const name = requiredText(input.name, 'name', NAME_MAX);
  if (isFail(name)) return name;
  const description = optionalText(input.description, 'description', DESCRIPTION_MAX);
  if (isFail(description)) return description;
  return { ok: true as const, name, description };
}

/** null = private; otherwise the viewer must belong to the workspace. */
async function resolveWorkspace(
  workspaceId: unknown,
  userId: string,
): Promise<ActionResult<{ id: string | null }, Field>> {
  if (workspaceId === null || workspaceId === undefined || workspaceId === '') {
    return { ok: true, id: null };
  }
  if (typeof workspaceId !== 'string') return fail('Invalid workspace.', 'workspaceId');
  const membership = await getWorkspaceMembership(workspaceId, userId);
  if (!membership || membership.workspaceId !== workspaceId) {
    return fail('You aren’t a member of that workspace.', 'workspaceId');
  }
  return { ok: true, id: workspaceId };
}

/** Templates the viewer can use (own + shared with their workspaces). */
export async function listProjectTemplates(): Promise<
  ActionResult<{ templates: ProjectTemplateRow[] }>
> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;
  return { ok: true, templates: await readProjectTemplates(session.user.id) };
}

export async function createProjectTemplate(input: {
  projectId: string;
  name: string;
  description?: string;
  workspaceId?: string | null;
}): Promise<ProjectTemplateResult> {
  const auth = await authorizeProjectAction(input?.projectId, 'admin');
  if (!auth.ok) {
    return auth.error === 'Forbidden'
      ? fail('You need to be an admin of that project.', 'projectId')
      : auth;
  }
  const fields = validate(input);
  if (!fields.ok) return fields;
  const workspace = await resolveWorkspace(input.workspaceId, auth.userId);
  if (!workspace.ok) return workspace;

  const config = await snapshotProject(input.projectId);
  if (!config) return fail('Project not found.', 'projectId');

  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(projectTemplates).values({
    id,
    ownerId: auth.userId,
    workspaceId: workspace.id,
    name: fields.name,
    description: fields.description,
    config: config as unknown as Record<string, unknown>,
    createdAt: now,
    updatedAt: now,
  });
  refreshesData();
  const [template] = await readProjectTemplates(auth.userId, id);
  return { ok: true, template };
}

export async function updateProjectTemplate(input: {
  id: string;
  name: string;
  description?: string;
  workspaceId?: string | null;
}): Promise<ProjectTemplateResult> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;
  if (typeof input?.id !== 'string' || !input.id) return NOT_FOUND;
  const fields = validate(input);
  if (!fields.ok) return fields;
  const workspace = await resolveWorkspace(input.workspaceId, session.user.id);
  if (!workspace.ok) return workspace;

  const updated = await db
    .update(projectTemplates)
    .set({
      name: fields.name,
      description: fields.description,
      workspaceId: workspace.id,
      updatedAt: new Date(),
    })
    .where(and(eq(projectTemplates.id, input.id), eq(projectTemplates.ownerId, session.user.id)))
    .returning({ id: projectTemplates.id });
  if (updated.length === 0) return NOT_FOUND;
  refreshesData();
  const [template] = await readProjectTemplates(session.user.id, input.id);
  return { ok: true, template };
}

export async function deleteProjectTemplate(input: { id: string }): Promise<ProjectTemplateResult> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;
  if (typeof input?.id !== 'string' || !input.id) return NOT_FOUND;
  const deleted = await db
    .delete(projectTemplates)
    .where(and(eq(projectTemplates.id, input.id), eq(projectTemplates.ownerId, session.user.id)))
    .returning({ id: projectTemplates.id });
  if (deleted.length === 0) return NOT_FOUND;
  refreshesData();
  return { ok: true };
}
