'use client';

import { useEffect, useRef, useState } from 'react';

import { deleteDraft, saveDraft } from '@/app/actions/drafts';
import type { IssuePatch } from '@/lib/issue-model';

export interface DraftContent {
  id: string;
  title: string;
  description: string;
  props: IssuePatch;
}

const DELAY_MS = 800;

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Debounced draft saving for the new-issue dialog. `discard` waits for any
 * in-flight save first, so a late save can't resurrect a deleted draft.
 */
export function useDraftAutosave(projectId: string, enabled: boolean) {
  const [status, setStatus] = useState<DraftStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<DraftContent | null>(null);
  const lastSave = useRef<Promise<unknown>>(Promise.resolve());

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  };

  const save = (content: DraftContent) => {
    setStatus('saving');
    const run = lastSave.current.then(() =>
      saveDraft({
        projectId,
        id: content.id,
        title: content.title,
        description: content.description,
        data: content.props,
      })
        .then((result) => setStatus(result.ok ? 'saved' : 'error'))
        .catch(() => setStatus('error')),
    );
    lastSave.current = run;
  };

  useEffect(() => clear, []);

  return {
    status,
    /** Save `content` after a pause in typing. */
    schedule(content: DraftContent) {
      if (!enabled) return;
      clear();
      pending.current = content;
      timer.current = setTimeout(() => {
        pending.current = null;
        timer.current = null;
        save(content);
      }, DELAY_MS);
    },
    /** Save a pending change now (closing the dialog). True if one was pending. */
    flush() {
      const content = pending.current;
      clear();
      if (content) save(content);
      return Boolean(content);
    },
    /** Drop a pending save (submitting). */
    cancel: clear,
    /** Delete draft `id` (after any save in flight); drops its pending save only. */
    discard(id: string) {
      if (pending.current?.id === id) clear();
      lastSave.current = lastSave.current.then(() => deleteDraft({ id }).catch(() => undefined));
    },
    reset() {
      clear();
      setStatus('idle');
    },
  };
}
