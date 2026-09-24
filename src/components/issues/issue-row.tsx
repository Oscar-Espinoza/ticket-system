'use client';

import type { Ref } from 'react';

import { Avatar, StatusIcon } from '@/components/ui-icons';
import { STATUS_LABEL, type IssueRow as Issue, type TicketStatus } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { IssueStatusMenu } from './issue-status-menu';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

export function relativeTime(date: Date, now = Date.now()): string {
  const seconds = (new Date(date).getTime() - now) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export interface IssueRowProps {
  issue: Issue;
  active: boolean;
  statusMenuOpen: boolean;
  onStatusMenuOpenChange: (open: boolean) => void;
  onStatusChange: (status: TicketStatus) => void;
  onFocus: () => void;
  onSelect?: () => void;
  ref?: Ref<HTMLDivElement>;
}

export function IssueRow({
  issue,
  active,
  statusMenuOpen,
  onStatusMenuOpenChange,
  onStatusChange,
  onFocus,
  onSelect,
  ref,
}: IssueRowProps) {
  return (
    <div
      ref={ref}
      tabIndex={0}
      data-issue-row={issue.id}
      data-active={active}
      aria-label={`${issue.key} ${issue.title}, ${STATUS_LABEL[issue.status]}`}
      aria-current={active ? 'true' : undefined}
      onFocus={onFocus}
      onClick={onSelect}
      className={cn(
        'group flex h-9 items-center gap-3 rounded-md px-2 text-sm outline-none transition-colors',
        'hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        active && 'bg-accent/40',
        onSelect && 'cursor-pointer',
      )}
    >
      <IssueStatusMenu
        status={issue.status}
        onChange={onStatusChange}
        open={statusMenuOpen}
        onOpenChange={onStatusMenuOpenChange}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document
            .querySelector<HTMLElement>(`[data-issue-row="${issue.id}"]`)
            ?.focus();
        }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Change status (${STATUS_LABEL[issue.status]})`}
          onClick={(event) => event.stopPropagation()}
          className="-m-1 flex rounded p-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StatusIcon status={issue.status} size={14} />
        </button>
      </IssueStatusMenu>

      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
        {issue.key}
      </span>
      <span className="min-w-0 flex-1 truncate">{issue.title}</span>

      {issue.assignee && (
        <Avatar
          name={issue.assignee.name}
          src={issue.assignee.image}
          size={20}
          className="shrink-0"
        />
      )}
      <time
        dateTime={new Date(issue.createdAt).toISOString()}
        title={new Date(issue.createdAt).toLocaleString()}
        suppressHydrationWarning
        className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
      >
        {relativeTime(issue.createdAt)}
      </time>
    </div>
  );
}
