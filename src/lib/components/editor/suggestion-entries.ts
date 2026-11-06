// Shared types/constants of the suggestion menu, used by the menu, its options, the rich editor's
// extensions and the raw editor.
import type { LucideIcon } from '@lucide/svelte';

import type { IssueUser } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import type { EditorIssue } from './context.svelte';

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

export function optionClass(active: boolean) {
  return cn(
    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5',
    active && 'bg-accent text-accent-foreground',
  );
}
