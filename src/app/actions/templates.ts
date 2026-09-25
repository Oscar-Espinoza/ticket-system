'use server';

// Issue templates (per project). Anyone who can read the project can list them;
// writers (members and up) manage them — same bar as creating issues.

import { revalidatePath } from 'next/cache';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { issueTemplates } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { DESCRIPTION_MAX, TITLE_MAX } from '@/lib/issue-service';
import {
  TEMPLATE_FIELDS,
  sanitizeIssueDefaults,
  type IssueDefaults,
} from '@/components/productivity/issue-defaults';

export interface IssueTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  data: IssueDefaults;
}

type Fail = { ok: false; error: string; field?: 'name' | 'title' | 'description' };
export type TemplateResult = { ok: true; template: IssueTemplate } | Fail;

const NAME_MAX = 60;

const columns = {
  id: issueTemplates.id,
  name: issueTemplates.name,
  title: issueTemplates.title,
  description: issueTemplates.description,
  data: issueTemplates.data,
};

function toTemplate(row: {
  id: string;
  name: string;
  title: string;
  description: string | null;
  data: Record<string, unknown>;
}): IssueTemplate {
  return { ...row, description: row.description ?? '', data: row.data as IssueDefaults };
}

function validate(input: { name?: unknown; title?: unknown; description?: unknown }) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, error: 'Name is required.', field: 'name' } satisfies Fail;
  if (name.length > NAME_MAX) {
    return { ok: false, error: `Name must be ${NAME_MAX} characters or fewer.`, field: 'name' } satisfies Fail;
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length > TITLE_MAX) {
    return { ok: false, error: `Title must be ${TITLE_MAX} characters or fewer.`, field: 'title' } satisfies Fail;
  }
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
      field: 'description',
    } satisfies Fail;
  }
  return { ok: true as const, name, title, description: description || null };
}

function revalidate(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}/settings/templates`);
}

export async function listTemplates(
  projectId: string,
): Promise<{ ok: true; templates: IssueTemplate[] } | Fail> {
  const authz = await authorizeProjectAction(projectId, 'read');
  if (!authz.ok) return authz;
  const rows = await db
    .select(columns)
    .from(issueTemplates)
    .where(eq(issueTemplates.projectId, projectId))
    .orderBy(asc(issueTemplates.name));
  return { ok: true, templates: rows.map(toTemplate) };
}

export async function createTemplate(input: {
  projectId: string;
  name: string;
  title?: string;
  description?: string;
  data?: unknown;
}): Promise<TemplateResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const fields = validate(input);
  if (!fields.ok) return fields;
  const data = await sanitizeIssueDefaults(input.projectId, input.data, TEMPLATE_FIELDS);
  const now = new Date();
  const [row] = await db
    .insert(issueTemplates)
    .values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      name: fields.name,
      title: fields.title,
      description: fields.description,
      data,
      createdById: authz.userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning(columns);
  revalidate(input.projectId);
  return { ok: true, template: toTemplate(row) };
}

export async function updateTemplate(input: {
  projectId: string;
  id: string;
  name: string;
  title?: string;
  description?: string;
  data?: unknown;
}): Promise<TemplateResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  if (typeof input.id !== 'string') return { ok: false, error: 'Template not found.' };
  const fields = validate(input);
  if (!fields.ok) return fields;
  const data = await sanitizeIssueDefaults(input.projectId, input.data, TEMPLATE_FIELDS);
  const [row] = await db
    .update(issueTemplates)
    .set({
      name: fields.name,
      title: fields.title,
      description: fields.description,
      data,
      updatedAt: new Date(),
    })
    .where(and(eq(issueTemplates.id, input.id), eq(issueTemplates.projectId, input.projectId)))
    .returning(columns);
  if (!row) return { ok: false, error: 'Template not found.' };
  revalidate(input.projectId);
  return { ok: true, template: toTemplate(row) };
}

export async function deleteTemplate(input: {
  projectId: string;
  id: string;
}): Promise<{ ok: true } | Fail> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  if (typeof input.id !== 'string') return { ok: false, error: 'Template not found.' };
  const deleted = await db
    .delete(issueTemplates)
    .where(and(eq(issueTemplates.id, input.id), eq(issueTemplates.projectId, input.projectId)))
    .returning({ id: issueTemplates.id });
  if (deleted.length === 0) return { ok: false, error: 'Template not found.' };
  revalidate(input.projectId);
  return { ok: true };
}
