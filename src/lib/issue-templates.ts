// Reads of a project's issue templates. No authorization here: callers check
// read access to the project first. Server-only.

import { asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { issueTemplates } from '@/db/schema';
import type { IssueDefaults } from '@/lib/issue-defaults';

export interface IssueTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  data: IssueDefaults;
}

export const issueTemplateColumns = {
  id: issueTemplates.id,
  name: issueTemplates.name,
  title: issueTemplates.title,
  description: issueTemplates.description,
  data: issueTemplates.data,
};

export function toIssueTemplate(row: {
  id: string;
  name: string;
  title: string;
  description: string | null;
  data: Record<string, unknown>;
}): IssueTemplate {
  return { ...row, description: row.description ?? '', data: row.data as IssueDefaults };
}

/** The project's issue templates by name. */
export async function readIssueTemplates(projectId: string): Promise<IssueTemplate[]> {
  const rows = await db
    .select(issueTemplateColumns)
    .from(issueTemplates)
    .where(eq(issueTemplates.projectId, projectId))
    .orderBy(asc(issueTemplates.name));
  return rows.map(toIssueTemplate);
}
