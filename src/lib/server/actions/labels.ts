// Label mutations (write level): validate (names 1–40 chars, colors #rrggbb),
// then the labels service applies them and enforces name uniqueness per project.

import { authorizeProjectAction } from '@/lib/action-auth';
import {
  createLabel as createProjectLabel,
  deleteLabel as deleteProjectLabel,
  labelNameTaken,
  updateLabel as updateProjectLabel,
} from '@/lib/labels';
import { LABEL_DESCRIPTION_MAX, LABEL_NAME_MAX } from '@/lib/label-model';
import type { IssueLabel } from '@/lib/issue-model';
import {
  descriptionOrNull,
  fail,
  hexColor,
  isFail,
  refreshesData,
  requiredText,
  type ActionResult,
} from '@/lib/server/action-kit';

export type LabelActionResult = ActionResult<{ label?: IssueLabel }, 'name' | 'color' | 'description'>;

const DUPLICATE = fail('A label with this name already exists.', 'name');

export async function createLabel(input: {
  projectId: string;
  name: string;
  color: string;
  description?: string | null;
}): Promise<LabelActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;

  const name = requiredText(input.name, 'name', LABEL_NAME_MAX);
  if (isFail(name)) return name;
  const color = hexColor(input.color);
  if (isFail(color)) return color;
  const description = descriptionOrNull(input.description, LABEL_DESCRIPTION_MAX);
  if (isFail(description)) return description;

  const created = await createProjectLabel(input.projectId, { name, color, description });
  if (!created.ok) return DUPLICATE;
  refreshesData();
  return { ok: true, label: created.label };
}

export async function updateLabel(input: {
  projectId: string;
  id: string;
  name?: string;
  color?: string;
  description?: string | null;
}): Promise<LabelActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;

  const changes: { name?: string; color?: string; description?: string | null } = {};
  if (input.name !== undefined) {
    const name = requiredText(input.name, 'name', LABEL_NAME_MAX);
    if (isFail(name)) return name;
    if (await labelNameTaken(input.projectId, name, input.id)) return DUPLICATE;
    changes.name = name;
  }
  if (input.color !== undefined) {
    const color = hexColor(input.color);
    if (isFail(color)) return color;
    changes.color = color;
  }
  if (input.description !== undefined) {
    const description = descriptionOrNull(input.description, LABEL_DESCRIPTION_MAX);
    if (isFail(description)) return description;
    changes.description = description;
  }
  if (Object.keys(changes).length === 0) return { ok: true };

  const updated = await updateProjectLabel(input.projectId, input.id, changes);
  if (!updated.ok) return updated.reason === 'duplicate' ? DUPLICATE : fail('Label not found.');
  refreshesData();
  return { ok: true, label: updated.label };
}

/** Removes the label from every issue too (issue_label cascades). */
export async function deleteLabel(input: {
  projectId: string;
  id: string;
}): Promise<LabelActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  if (!(await deleteProjectLabel(input.projectId, input.id))) return fail('Label not found.');
  refreshesData();
  return { ok: true };
}
