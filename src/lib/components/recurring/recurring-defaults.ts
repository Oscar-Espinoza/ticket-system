// Stored defaults → property chips value (port of the non-exported helper in
// src/components/recurring/recurring-settings.tsx).

import { isPriority, type IssuePatch } from '@/lib/issue-model';
import type { ProjectData } from '@/lib/project-data-types';
import type { RecurringDefaults } from '@/lib/recurring-schedule';

/** Stored defaults → chips value, dropping ids the project no longer has. */
export function defaultsToPatch(
  data: RecurringDefaults,
  project: Pick<ProjectData, 'states' | 'labels' | 'members' | 'project'>,
): IssuePatch {
  const patch: IssuePatch = {};
  if (data.stateId && project.states.some((s) => s.id === data.stateId)) patch.stateId = data.stateId;
  if (isPriority(data.priority)) patch.priority = data.priority;
  if (data.assigneeId && project.members.some((m) => m.id === data.assigneeId)) {
    patch.assigneeId = data.assigneeId;
  }
  const labelIds = (data.labelIds ?? []).filter((id) => project.labels.some((l) => l.id === id));
  if (labelIds.length) patch.labelIds = labelIds;
  if (data.estimate != null && project.project.estimateScale !== 'none') patch.estimate = data.estimate;
  return patch;
}
