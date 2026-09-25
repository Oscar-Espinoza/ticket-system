'use server';

// Project templates: save a project's setup (states, labels, estimates,
// cycles / triage / automation settings, SLA policy, issue templates) and reuse
// it when creating projects. Saving needs project admin; a template is private
// to its owner unless shared with a workspace the owner belongs to, whose
// members may then use (not edit) it. Only the owner edits or deletes.

import { revalidatePath } from 'next/cache';
import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectTemplates, users, workspaces } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import {
  normalizeTemplateConfig,
  snapshotProject,
  templateSummary,
  usableTemplateFilter,
} from '@/lib/project-templates';
import { getSession } from '@/lib/session';
import { getWorkspaceMembership } from '@/lib/workspace-access';

export interface ProjectTemplateRow {
  id: string;
  name: string;
  description: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  ownerName: string | null;
  /** The viewer owns it (may edit / delete). */
  isOwner: boolean;
  updatedAt: string;
  summary: ReturnType<typeof templateSummary>;
}

type Field = 'name' | 'description' | 'workspaceId' | 'projectId';
export type ProjectTemplateResult =
  | { ok: true; template?: ProjectTemplateRow }
  | { ok: false; error: string; field?: Field };

const NAME_MAX = 60;
const DESCRIPTION_MAX = 500;
const NOT_AUTHENTICATED = { ok: false as const, error: 'Not authenticated' };
const NOT_FOUND = { ok: false as const, error: 'Template not found.' };

function validate(input: { name?: unknown; description?: unknown }) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false as const, error: 'Name is required.', field: 'name' as const };
  if (name.length > NAME_MAX) {
    return { ok: false as const, error: `Name must be ${NAME_MAX} characters or fewer.`, field: 'name' as const };
  }
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > DESCRIPTION_MAX) {
    return {
      ok: false as const,
      error: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
      field: 'description' as const,
    };
  }
  return { ok: true as const, name, description: description || null };
}

/** null = private; otherwise the viewer must belong to the workspace. */
async function resolveWorkspace(
  workspaceId: unknown,
  userId: string,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string; field: Field }> {
  if (workspaceId === null || workspaceId === undefined || workspaceId === '') {
    return { ok: true, id: null };
  }
  if (typeof workspaceId !== 'string') return { ok: false, error: 'Invalid workspace.', field: 'workspaceId' };
  const membership = await getWorkspaceMembership(workspaceId, userId);
  if (!membership || membership.workspaceId !== workspaceId) {
    return { ok: false, error: 'You aren’t a member of that workspace.', field: 'workspaceId' };
  }
  return { ok: true, id: workspaceId };
}

async function loadRows(userId: string, id?: string): Promise<ProjectTemplateRow[]> {
  const rows = await db
    .select({
      id: projectTemplates.id,
      name: projectTemplates.name,
      description: projectTemplates.description,
      workspaceId: projectTemplates.workspaceId,
      workspaceName: workspaces.name,
      ownerId: projectTemplates.ownerId,
      ownerName: users.name,
      config: projectTemplates.config,
      updatedAt: projectTemplates.updatedAt,
    })
    .from(projectTemplates)
    .leftJoin(workspaces, eq(projectTemplates.workspaceId, workspaces.id))
    .leftJoin(users, eq(projectTemplates.ownerId, users.id))
    .where(and(usableTemplateFilter(userId), id ? eq(projectTemplates.id, id) : undefined))
    .orderBy(desc(projectTemplates.updatedAt), asc(projectTemplates.name));
  return rows.map(({ config, ownerId, updatedAt, ...row }) => ({
    ...row,
    isOwner: ownerId === userId,
    updatedAt: updatedAt.toISOString(),
    summary: templateSummary(normalizeTemplateConfig(config)),
  }));
}

function revalidateTemplates() {
  revalidatePath('/dashboard/templates');
}

/** Templates the viewer can use (own + shared with their workspaces). */
export async function listProjectTemplates(): Promise<
  { ok: true; templates: ProjectTemplateRow[] } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;
  return { ok: true, templates: await loadRows(session.user.id) };
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
      ? { ok: false, error: 'You need to be an admin of that project.', field: 'projectId' }
      : auth;
  }
  const fields = validate(input);
  if (!fields.ok) return fields;
  const workspace = await resolveWorkspace(input.workspaceId, auth.userId);
  if (!workspace.ok) return workspace;

  const config = await snapshotProject(input.projectId);
  if (!config) return { ok: false, error: 'Project not found.', field: 'projectId' };

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
  revalidateTemplates();
  const [template] = await loadRows(auth.userId, id);
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
  revalidateTemplates();
  const [template] = await loadRows(session.user.id, input.id);
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
  revalidateTemplates();
  return { ok: true };
}
