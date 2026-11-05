// Possible duplicates of a title being typed: debounced, only once the title is
// long enough to mean something, and only the latest request's answer counts.
//
// Port of src/components/similar/use-possible-duplicates.ts:
//   const similar = usePossibleDuplicates(() => projectId, () => title, () => enabled);
//   similar.current: SimilarIssue[]   (each argument may also be a plain value)
// Call during component init (it creates an $effect).

import { findPossibleDuplicates } from '@/lib/actions/similarity';
import type { SimilarIssue } from '@/lib/similarity';

export const DUPLICATE_MIN_CHARS = 8;
const DEBOUNCE_MS = 450;
const NONE: SimilarIssue[] = [];

type MaybeGetter<T> = T | (() => T);
const read = <T>(value: MaybeGetter<T>): T => (typeof value === 'function' ? (value as () => T)() : value);

export function usePossibleDuplicates(
  projectId: MaybeGetter<string>,
  title: MaybeGetter<string>,
  enabled: MaybeGetter<boolean>,
): { readonly current: SimilarIssue[] } {
  let result = $state.raw<{ query: string; similar: SimilarIssue[] } | null>(null);
  let seq = 0;
  const query = $derived(read(title).trim());
  const active = $derived(read(enabled) && query.length >= DUPLICATE_MIN_CHARS);

  $effect(() => {
    if (!active) return;
    const id = ++seq;
    const q = query;
    const project = read(projectId);
    const timer = setTimeout(() => {
      findPossibleDuplicates({ projectId: project, title: q })
        .then((res) => {
          if (id === seq) result = { query: q, similar: res.ok ? res.similar : NONE };
        })
        .catch(() => {
          // Advisory: a failed lookup just shows no hints.
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  return {
    // Keep showing the previous answer while the next one is in flight, but
    // never once the title is too short (or the dialog closed).
    get current() {
      return active && result ? result.similar : NONE;
    },
  };
}
