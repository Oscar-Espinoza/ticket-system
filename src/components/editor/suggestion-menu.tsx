'use client';

// Caret-anchored suggestion list shared by both editor modes: members (@),
// issues (# / KEY-) and slash commands. Rendered inline inside the editor
// root, positioned by the caller; options pick on mousedown so the editor
// never loses focus.

import { useEffect, type CSSProperties, type MouseEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Avatar, StateIcon } from '@/components/ui-icons';
import type { IssueUser } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import type { EditorIssue } from './context';

export const MENU_WIDTH = 240;
export const MENU_CLASS =
  'absolute z-50 max-h-72 overflow-y-auto overscroll-contain rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10';

export interface SlashCommand {
  id: string;
  label: string;
  /** Extra words the filter matches. */
  keywords: string;
  icon: LucideIcon;
  /** Markdown-ish hint on the right, e.g. "#" or "```". */
  hint?: string;
}

export type SuggestionEntry =
  | { type: 'member'; member: IssueUser }
  | { type: 'issue'; issue: EditorIssue }
  | { type: 'command'; command: SlashCommand };

export function entryKey(entry: SuggestionEntry): string {
  if (entry.type === 'member') return `m:${entry.member.id}`;
  if (entry.type === 'issue') return `i:${entry.issue.id}`;
  return `c:${entry.command.id}`;
}

function optionClass(active: boolean) {
  return cn(
    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5',
    active && 'bg-accent text-accent-foreground',
  );
}

interface OptionProps {
  id: string;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}

function optionHandlers({ onPick, onHover }: OptionProps) {
  return {
    // mousedown + preventDefault: pick without blurring the editor.
    onMouseDown: (e: MouseEvent) => {
      e.preventDefault();
      onPick();
    },
    onMouseMove: onHover,
  };
}

export function MemberOption({ member, ...props }: OptionProps & { member: IssueUser }) {
  return (
    <li id={props.id} role="option" aria-selected={props.active} className={optionClass(props.active)} {...optionHandlers(props)}>
      <Avatar name={member.name} src={member.image} size={20} />
      <span className="truncate">{member.name}</span>
    </li>
  );
}

function EntryOption({ entry, ...props }: OptionProps & { entry: SuggestionEntry }) {
  if (entry.type === 'member') return <MemberOption member={entry.member} {...props} />;
  const common = {
    id: props.id,
    role: 'option',
    'aria-selected': props.active,
    className: optionClass(props.active),
    ...optionHandlers(props),
  };
  if (entry.type === 'issue') {
    const { issue } = entry;
    return (
      <li {...common}>
        {issue.state ? (
          <StateIcon state={issue.state} className="size-3.5 shrink-0" />
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{issue.key}</span>
        <span className="truncate">{issue.title}</span>
      </li>
    );
  }
  const { command } = entry;
  const Icon = command.icon;
  return (
    <li {...common}>
      <span className="flex size-6 shrink-0 items-center justify-center rounded border border-border bg-background text-muted-foreground [&_svg]:size-3.5">
        <Icon aria-hidden />
      </span>
      <span className="flex-1 truncate">{command.label}</span>
      {command.hint && <kbd className="font-mono text-[11px] text-muted-foreground">{command.hint}</kbd>}
    </li>
  );
}

const LABELS = { member: 'Mention a teammate', issue: 'Reference an issue', command: 'Insert block' };

export function SuggestionMenu({
  id,
  entries,
  active,
  loading,
  style,
  onPick,
  onHover,
}: {
  id: string;
  entries: readonly SuggestionEntry[];
  active: number;
  loading?: boolean;
  style: CSSProperties;
  onPick: (entry: SuggestionEntry) => void;
  onHover: (index: number) => void;
}) {
  const kind = entries[0]?.type ?? 'issue';
  useEffect(() => {
    document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [id, active]);
  return (
    <ul id={id} role="listbox" aria-label={LABELS[kind]} style={{ width: MENU_WIDTH, ...style }} className={MENU_CLASS}>
      {entries.length === 0 && loading && (
        <li role="presentation" className="px-2 py-1.5 text-muted-foreground">
          Searching…
        </li>
      )}
      {entries.map((entry, i) => (
        <EntryOption
          key={entryKey(entry)}
          id={`${id}-${i}`}
          entry={entry}
          active={i === active}
          onPick={() => onPick(entry)}
          onHover={() => onHover(i)}
        />
      ))}
    </ul>
  );
}
