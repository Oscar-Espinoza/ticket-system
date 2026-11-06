// Issue templates (per project). Anyone who can read the project can list them;
// writers (members and up) manage them — same bar as creating issues.

import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { issueTemplates } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { DESCRIPTION_MAX, TITLE_MAX } from '@/lib/issue-service';
import {
  fail,
  isFail,
  optionalText,
  refreshesData,
  requiredText,
  type ActionResult,
} from '@/lib/server/action-kit';
import {
  TEMPLATE_FIELDS,
  sanitizeIssueDefaults,
  type IssueDefaults,
} from '@/lib/issue-defaults';

export interface IssueTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  data: IssueDefaults;
}

export type TemplateResult = ActionResult<{ template: IssueTemplate }, 'name' | 'title' | 'description'>;

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
  const name = requiredText(input.name, 'name', NAME_MAX);
  if (isFail(name)) return name;
  const title = optionalText(input.title, 'title', TITLE_MAX);
  if (isFail(title)) return title;
  const description = optionalText(input.description, 'description', DESCRIPTION_MAX);
  if (isFail(description)) return description;
  return { ok: true as const, name, title: title ?? '', description };
}

export async function listTemplates(
  projectId: string,
): Promise<ActionResult<{ templates: IssueTemplate[] }>> {
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
  refreshesData();
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
  if (typeof input.id !== 'string') return fail('Template not found.');
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
  if (!row) return fail('Template not found.');
  refreshesData();
  return { ok: true, template: toTemplate(row) };
}

export async function deleteTemplate(input: {
  projectId: string;
  id: string;
}): Promise<ActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  if (typeof input.id !== 'string') return fail('Template not found.');
  const deleted = await db
    .delete(issueTemplates)
    .where(and(eq(issueTemplates.id, input.id), eq(issueTemplates.projectId, input.projectId)))
    .returning({ id: issueTemplates.id });
  if (deleted.length === 0) return fail('Template not found.');
  refreshesData();
  return { ok: true };
}
