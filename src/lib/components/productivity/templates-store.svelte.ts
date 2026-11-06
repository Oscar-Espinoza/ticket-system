// Per-project template cache for the new-issue dialog and palette: one
// listTemplates call per project per session, refetched after CRUD in this tab.
//
// Usage:
//   useTemplates(projectId, enabled?) → { readonly current: IssueTemplate[] | undefined }
//     Call during component init. `projectId` / `enabled` may be getters so the
//     store follows prop changes. `current` is undefined while loading (or while
//     `enabled` is false and nothing is cached) — read it in markup / $derived.
//   setCachedTemplates(projectId, templates)   unchanged
//   templateProps(template, data)              unchanged

import { createSubscriber } from 'svelte/reactivity';

import { listTemplates, type IssueTemplate } from '@/lib/actions/templates';
import type { IssuePatch } from '@/lib/issue-model';
import type { ProjectData } from '@/lib/project-data-types';

export type { IssueTemplate };

const loaded = new Map<string, IssueTemplate[]>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const track = createSubscriber((update) => subscribe(update));

function fetchTemplates(projectId: string) {
  if (inflight.has(projectId)) return;
  inflight.add(projectId);
  listTemplates(projectId)
    // A failure caches an empty list so the effect doesn't retry in a loop.
    .then((result) => loaded.set(projectId, result.ok ? result.templates : []))
    .catch(() => loaded.set(projectId, []))
    .finally(() => {
      inflight.delete(projectId);
      emit();
    });
}

/** Replace the cached list (e.g. the settings page after a change). */
export function setCachedTemplates(projectId: string, templates: IssueTemplate[]) {
  loaded.set(projectId, templates);
  emit();
}

type MaybeGetter<T> = T | (() => T);
const read = <T>(value: MaybeGetter<T>): T =>
  typeof value === 'function' ? (value as () => T)() : value;

/** The project's templates; undefined while loading (or while `enabled` is false). */
export function useTemplates(
  projectId: MaybeGetter<string>,
  enabled: MaybeGetter<boolean> = true,
): { readonly current: IssueTemplate[] | undefined } {
  // Server snapshot is undefined.
  $effect(() => {
    track();
    const id = read(projectId);
    if (read(enabled) && loaded.get(id) === undefined) fetchTemplates(id);
  });
  return {
    get current() {
      track();
      return loaded.get(read(projectId));
    },
  };
}

/**
 * A template's properties limited to what still exists in the project (labels
 * or members may have been removed since it was saved).
 */
export function templateProps(
  template: IssueTemplate,
  data: Pick<ProjectData, 'states' | 'labels' | 'members' | 'project'>,
): IssuePatch {
  const { stateId, priority, assigneeId, labelIds, estimate } = template.data;
  const props: IssuePatch = {};
  if (stateId && data.states.some((s) => s.id === stateId)) props.stateId = stateId;
  if (priority) props.priority = priority;
  if (assigneeId && data.members.some((m) => m.id === assigneeId)) props.assigneeId = assigneeId;
  if (labelIds?.length) {
    const ids = labelIds.filter((id) => data.labels.some((l) => l.id === id));
    if (ids.length) props.labelIds = ids;
  }
  if (estimate != null && data.project.estimateScale !== 'none') props.estimate = estimate;
  return props;
}
