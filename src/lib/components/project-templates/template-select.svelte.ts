// Project-template list shared by every create-project dialog on the page.
// Templates load the first time a dialog opens; saving / deleting a template
// calls `invalidateProjectTemplates()`.
//
// Svelte port of the non-component exports of template-select.tsx:
//   invalidateProjectTemplates()
//   useProjectTemplates(enabled)  → { readonly current: ProjectTemplateRow[] | undefined }
//     `enabled` is a boolean or a getter (dialog open); undefined while loading.
//     Call during component init.
// Also re-exported from template-select.svelte's module script.

import { listProjectTemplates, type ProjectTemplateRow } from '@/lib/actions/project-templates';

let cache: Promise<ProjectTemplateRow[]> | null = null;

function loadTemplates(): Promise<ProjectTemplateRow[]> {
  cache ??= listProjectTemplates().then(
    (result) => (result.ok ? result.templates : []),
    () => {
      cache = null;
      return [];
    },
  );
  return cache;
}

export function invalidateProjectTemplates() {
  cache = null;
}

/** Usable templates once `enabled` (dialog open); undefined while loading. */
export function useProjectTemplates(enabled: boolean | (() => boolean)): {
  readonly current: ProjectTemplateRow[] | undefined;
} {
  let templates = $state.raw<ProjectTemplateRow[] | undefined>(undefined);

  $effect(() => {
    if (!(typeof enabled === 'function' ? enabled() : enabled)) return;
    let live = true;
    void loadTemplates().then((list) => {
      if (live) templates = list;
    });
    return () => {
      live = false;
    };
  });

  return {
    get current() {
      return templates;
    },
  };
}
