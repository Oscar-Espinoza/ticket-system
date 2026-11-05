// Svelte port of src/components/productivity/use-draft-autosave.ts.
//
//   const autosave = useDraftAutosave(projectId, enabled)   // during component init
//   autosave.status                                         // reactive getter
//   autosave.schedule(content) / flush() / cancel() / discard(id) / reset()
//
// `projectId` / `enabled` may be getters so the hook follows prop changes (the
// React hook read the latest render's values). Pending saves are dropped when
// the component is destroyed, like the React unmount cleanup.

import { deleteDraft, saveDraft } from '@/lib/actions/drafts';
import type { IssuePatch } from '@/lib/issue-model';

export interface DraftContent {
  id: string;
  title: string;
  description: string;
  props: IssuePatch;
}

const DELAY_MS = 800;

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'error';

type MaybeGetter<T> = T | (() => T);
const read = <T>(value: MaybeGetter<T>): T =>
  typeof value === 'function' ? (value as () => T)() : value;

export interface DraftAutosave {
  readonly status: DraftStatus;
  /** Save `content` after a pause in typing. */
  schedule(content: DraftContent): void;
  /** Save a pending change now (closing the dialog). True if one was pending. */
  flush(): boolean;
  /** Drop a pending save (submitting). */
  cancel(): void;
  /** Delete draft `id` (after any save in flight); drops its pending save only. */
  discard(id: string): void;
  reset(): void;
}

/**
 * Debounced draft saving for the new-issue dialog. `discard` waits for any
 * in-flight save first, so a late save can't resurrect a deleted draft.
 */
export function useDraftAutosave(
  projectId: MaybeGetter<string>,
  enabled: MaybeGetter<boolean>,
): DraftAutosave {
  let status = $state<DraftStatus>('idle');
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: DraftContent | null = null;
  let lastSave: Promise<unknown> = Promise.resolve();

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  const save = (content: DraftContent) => {
    status = 'saving';
    const id = read(projectId);
    const run = lastSave.then(() =>
      saveDraft({
        projectId: id,
        id: content.id,
        title: content.title,
        description: content.description,
        data: content.props,
      })
        .then((result) => {
          status = result.ok ? 'saved' : 'error';
        })
        .catch(() => {
          status = 'error';
        }),
    );
    lastSave = run;
  };

  $effect(() => clear);

  return {
    get status() {
      return status;
    },
    schedule(content: DraftContent) {
      if (!read(enabled)) return;
      clear();
      pending = content;
      timer = setTimeout(() => {
        pending = null;
        timer = null;
        save(content);
      }, DELAY_MS);
    },
    flush() {
      const content = pending;
      clear();
      if (content) save(content);
      return Boolean(content);
    },
    cancel: clear,
    discard(id: string) {
      if (pending?.id === id) clear();
      lastSave = lastSave.then(() => deleteDraft({ id }).catch(() => undefined));
    },
    reset() {
      clear();
      status = 'idle';
    },
  };
}
