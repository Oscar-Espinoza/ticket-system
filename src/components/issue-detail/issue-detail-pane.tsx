'use client';

import { useEffect, useEffectEvent, useSyncExternalStore } from 'react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { registerHotkeys } from '@/lib/hotkeys';
import type { IssueAssignee, IssueRow } from '@/lib/issue-model';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { IssueDetail } from './issue-detail';

const DESKTOP_QUERY = '(min-width: 1024px)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function useIsDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

export function IssueDetailPane({
  issue,
  members,
  mutations,
  onClose,
}: {
  issue: IssueRow;
  members: IssueAssignee[];
  mutations: IssueMutations;
  onClose: () => void;
}) {
  const desktop = useIsDesktop();
  const close = useEffectEvent(onClose);

  // Desktop pane isn't a dialog, so Esc goes through the C3 registry (which
  // already ignores it inside text fields and while a menu/dialog is open).
  useEffect(() => {
    if (!desktop) return;
    return registerHotkeys([
      { key: 'Escape', scope: 'Issue', description: 'Close issue', handler: () => close() },
    ]);
  }, [desktop]);

  const detail = (
    <IssueDetail
      key={issue.id}
      issue={issue}
      members={members}
      mutations={mutations}
      onClose={onClose}
    />
  );

  if (desktop) {
    return (
      <aside
        aria-label={`Issue ${issue.key}`}
        data-issue-pane={issue.id}
        className="sticky top-0 ml-6 max-h-[calc(100vh-3.5rem)] w-[380px] shrink-0 self-start overflow-y-auto border-l border-border pl-6"
      >
        {detail}
      </aside>
    );
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full overflow-y-auto p-4 sm:max-w-md"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <SheetTitle className="sr-only">{issue.key}</SheetTitle>
        <SheetDescription className="sr-only">{issue.title}</SheetDescription>
        {detail}
      </SheetContent>
    </Sheet>
  );
}
