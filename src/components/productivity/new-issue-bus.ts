'use client';

// Lets anything open "the" new-issue dialog of the current page. Every mounted
// NewIssueDialog (for a writer) registers as a host; requests go to the newest
// regular host, else to a fallback host (IssueShortcuts renders one for pages
// without their own dialog, e.g. the issue permalink page).
//
// While any host is mounted, `c` creates an issue (registered once here — the
// registry fires every matching handler). The topbar's `c` reads
// `hasIssueCreator` to stay out of the way.

import { registerHotkeys } from '@/lib/hotkeys';
import type { IssuePatch } from '@/lib/issue-model';

/** What to open the dialog with; replaces its text and properties. */
export interface NewIssueSeed {
  title?: string;
  description?: string;
  props?: IssuePatch;
  /** Resume this draft (keep saving to it). */
  draftId?: string | null;
}

interface Host {
  fallback: boolean;
  /** No seed = open as is (keeps text typed earlier). */
  open: (seed?: NewIssueSeed) => void;
}

let hosts: Host[] = [];
let releaseHotkey: (() => void) | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export function requestNewIssue(seed?: NewIssueSeed): boolean {
  const host = hosts.findLast((h) => !h.fallback) ?? hosts.findLast((h) => h.fallback);
  host?.open(seed);
  return Boolean(host);
}

export function registerNewIssueHost(host: Host): () => void {
  hosts = [...hosts, host];
  if (!releaseHotkey) {
    releaseHotkey = registerHotkeys([
      {
        key: 'c',
        scope: 'Issues',
        description: 'Create issue',
        when: (event) => !event.shiftKey,
        handler: () => requestNewIssue(),
      },
    ]);
  }
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    hosts = hosts.filter((h) => h !== host);
    if (hosts.length === 0) {
      releaseHotkey?.();
      releaseHotkey = null;
    }
    emit();
  };
}

export const hasIssueCreator = () => hosts.length > 0;

export function subscribeIssueCreator(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Search params IssueShortcuts acts on (then strips from the URL). */
export const CREATE_PARAM = 'create';
export const DRAFT_PARAM = 'draft';
export const TEMPLATE_PARAM = 'template';
