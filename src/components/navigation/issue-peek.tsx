'use client';

// Read-only quick look at an issue (Space on a focused list row). Space / Esc
// close, Enter opens the full issue in the detail pane.

import { useRef } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, UserRound } from 'lucide-react';

import { Markdown } from '@/components/editor';
import { DueDateChip, LabelChips } from '@/components/issues/issue-properties';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Avatar, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { issuePath } from '@/lib/issue-links';
import { PRIORITY_LABEL, type IssueRow } from '@/lib/issue-model';

export function IssuePeek({
  issue,
  onClose,
  onOpen,
}: {
  issue: IssueRow | null;
  onClose: () => void;
  onOpen: (issue: IssueRow) => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={issue !== null} onOpenChange={(open) => !open && onClose()}>
      {issue && (
        <DialogContent
          ref={content}
          className="gap-4 sm:max-w-xl"
          // Focus the dialog itself, not its first button: the Space that
          // opened it would otherwise "click" that button on keyup.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            content.current?.focus();
          }}
          onKeyDown={(event) => {
            // The hotkey registry is paused while a dialog is open.
            if (event.target instanceof HTMLElement && event.target.closest('a, button')) return;
            if (event.key === ' ') {
              event.preventDefault();
              onClose();
            } else if (event.key === 'Enter') {
              event.preventDefault();
              onOpen(issue);
            }
          }}
        >
          <div className="flex items-center gap-2 pr-8 text-xs text-muted-foreground">
            <span className="font-mono">{issue.key}</span>
            <span aria-hidden="true">·</span>
            <span>Peek</span>
            <span className="ml-auto hidden sm:inline">
              <kbd className="font-sans">Enter</kbd> to open · <kbd className="font-sans">Space</kbd> to close
            </span>
          </div>
          <DialogTitle className="text-lg leading-snug font-medium">{issue.title}</DialogTitle>
          <DialogDescription className="sr-only">
            Preview of {issue.key}. Press Enter to open it, Space or Escape to close.
          </DialogDescription>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5">
              <StateIcon state={issue.state} size={14} />
              {issue.state.name}
            </span>
            <span className="flex items-center gap-1.5">
              <PriorityIcon priority={issue.priority} size={14} />
              {PRIORITY_LABEL[issue.priority]}
            </span>
            <span className="flex items-center gap-1.5">
              {issue.assignee ? (
                <>
                  <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />
                  {issue.assignee.name}
                </>
              ) : (
                <>
                  <UserRound className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Unassigned</span>
                </>
              )}
            </span>
            {issue.dueDate && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4 text-muted-foreground" />
                <DueDateChip dueDate={issue.dueDate} stateType={issue.state.type} />
              </span>
            )}
            {issue.labels.length > 0 && <LabelChips labels={issue.labels} max={6} className="flex-wrap" />}
          </div>

          <div className="max-h-[50vh] overflow-y-auto border-t border-border pt-3 text-sm">
            {issue.description?.trim() ? (
              <Markdown embeds={false}>{issue.description}</Markdown>
            ) : (
              <p className="text-muted-foreground">No description.</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={issuePath(issue.projectId, issue.key)}>
                Full page
                <ArrowUpRight />
              </Link>
            </Button>
            <Button size="sm" onClick={() => onOpen(issue)}>
              Open issue
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
