'use client';

import { useEffect, useRef, useState } from 'react';

import { findPossibleDuplicates } from '@/app/actions/similarity';
import type { SimilarIssue } from '@/lib/similarity';

export const DUPLICATE_MIN_CHARS = 8;
const DEBOUNCE_MS = 450;
const NONE: SimilarIssue[] = [];

/**
 * Possible duplicates of a title being typed: debounced, only once the title is
 * long enough to mean something, and only the latest request's answer counts.
 */
export function usePossibleDuplicates(
  projectId: string,
  title: string,
  enabled: boolean,
): SimilarIssue[] {
  const [result, setResult] = useState<{ query: string; similar: SimilarIssue[] } | null>(null);
  const seq = useRef(0);
  const query = title.trim();
  const active = enabled && query.length >= DUPLICATE_MIN_CHARS;

  useEffect(() => {
    if (!active) return;
    const id = ++seq.current;
    const timer = setTimeout(() => {
      findPossibleDuplicates({ projectId, title: query })
        .then((res) => {
          if (id === seq.current) setResult({ query, similar: res.ok ? res.similar : NONE });
        })
        .catch(() => {
          // Advisory: a failed lookup just shows no hints.
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, projectId, query]);

  // Keep showing the previous answer while the next one is in flight, but
  // never once the title is too short (or the dialog closed).
  return active && result ? result.similar : NONE;
}
