'use client';

// Markdown editor: autosizing textarea + quiet formatting toolbar, Write /
// Preview toggle and @mention autocomplete. Plain markdown in, plain markdown
// out — the value is controlled by the caller.

import {
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import {
  Bold,
  Code,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  SquareCode,
  type LucideIcon,
} from 'lucide-react';

import { useOptionalProjectData } from '@/components/project/project-data';
import { Avatar } from '@/components/ui-icons';
import { formatMention } from '@/lib/mentions';
import type { IssueUser } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';
import { formatEdit, mentionQueryAt, type MarkdownFormat, type TextEdit } from './text-edits';

const TOOLBAR: { format: MarkdownFormat; label: string; icon: LucideIcon; shortcut?: string }[] = [
  { format: 'bold', label: 'Bold', icon: Bold, shortcut: 'b' },
  { format: 'italic', label: 'Italic', icon: Italic, shortcut: 'i' },
  { format: 'code', label: 'Inline code', icon: Code, shortcut: 'e' },
  { format: 'link', label: 'Link', icon: Link, shortcut: 'k' },
  { format: 'bullet', label: 'Bulleted list', icon: List },
  { format: 'numbered', label: 'Numbered list', icon: ListOrdered },
  { format: 'task', label: 'Checklist', icon: ListTodo },
  { format: 'quote', label: 'Quote', icon: Quote },
  { format: 'codeblock', label: 'Code block', icon: SquareCode },
];

const SHORTCUTS = new Map(TOOLBAR.filter((t) => t.shortcut).map((t) => [t.shortcut!, t.format]));
const MENTION_LIMIT = 8;
const MENU_WIDTH = 224;

// Styles copied onto the mirror element that measures the caret position.
const MIRRORED = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
  'textTransform', 'wordSpacing', 'textIndent', 'tabSize',
] as const;

/**
 * Position just below the caret, relative to the textarea's offset parent (the
 * editor root). Rendered inline rather than portaled so it stays inside modal
 * layers (the mobile issue Sheet) instead of counting as an outside click.
 */
function caretPosition(textarea: HTMLTextAreaElement, index: number) {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  for (const prop of MIRRORED) mirror.style[prop] = style[prop];
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    top: '0',
    left: '-9999px',
  });
  mirror.textContent = textarea.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
  const maxLeft = (textarea.offsetParent?.clientWidth ?? textarea.clientWidth) - MENU_WIDTH;
  const position = {
    left: Math.max(0, Math.min(textarea.offsetLeft + marker.offsetLeft - textarea.scrollLeft, maxLeft)),
    top: textarea.offsetTop + marker.offsetTop - textarea.scrollTop + lineHeight + 4,
  };
  mirror.remove();
  return position;
}

interface MentionState {
  start: number;
  query: string;
  active: number;
  left: number;
  top: number;
}

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** ⌘Enter / Ctrl+Enter. */
  onSubmit?: () => void;
  /** Esc (after closing the mention menu, if open). */
  onCancel?: () => void;
  /** Focus left the whole editor (toolbar and preview toggle count as inside). */
  onBlur?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  maxLength?: number;
  /** @mention candidates; defaults to the current project's members. */
  members?: IssueUser[];
  /** Issue-key linking in the preview; defaults to the current project. */
  projectId?: string;
  ticketKey?: string;
  /** Show the formatting toolbar + preview toggle (default true). */
  toolbar?: boolean;
  /** Right side of the footer, e.g. Cancel / Submit buttons. */
  actions?: ReactNode;
  className?: string;
  textareaClassName?: string;
  ref?: Ref<HTMLTextAreaElement>;
  'aria-label'?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  onBlur,
  placeholder,
  autoFocus,
  disabled,
  maxLength = 10_000,
  members,
  projectId,
  ticketKey,
  toolbar = true,
  actions,
  className,
  textareaClassName,
  ref,
  'aria-label': ariaLabel,
}: MarkdownEditorProps) {
  const projectData = useOptionalProjectData();
  const candidates = members ?? projectData?.members ?? [];
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [mention, setMention] = useState<MentionState | null>(null);
  // No deps: preview mode swaps the textarea element out.
  useImperativeHandle(ref, () => textareaRef.current!);
  const listId = useId();

  const matches = mention
    ? candidates
        .filter((m) => m.name.toLowerCase().includes(mention.query.toLowerCase()))
        .slice(0, MENTION_LIMIT)
    : [];
  const menuOpen = mention !== null && matches.length > 0;

  function apply(edit: TextEdit) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(edit.start, edit.end);
    // insertText keeps the browser's undo stack; fall back to a controlled update.
    const inserted = document.execCommand?.('insertText', false, edit.text);
    if (!inserted) onChange(value.slice(0, edit.start) + edit.text + value.slice(edit.end));
    requestAnimationFrame(() => textarea.setSelectionRange(edit.selectStart, edit.selectEnd));
  }

  function format(kind: MarkdownFormat) {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;
    apply(formatEdit(textarea.value, textarea.selectionStart, textarea.selectionEnd, kind));
  }

  function syncMention() {
    const textarea = textareaRef.current;
    if (!textarea || candidates.length === 0) return;
    const caret = textarea.selectionStart;
    const found = textarea.selectionEnd === caret ? mentionQueryAt(textarea.value, caret) : null;
    if (!found) {
      if (mention) setMention(null);
      return;
    }
    if (mention?.start === found.start && mention.query === found.query) return;
    const { left, top } = caretPosition(textarea, found.start);
    setMention({ ...found, active: 0, left, top });
  }

  function insertMention(member: IssueUser) {
    const textarea = textareaRef.current;
    if (!textarea || !mention) return;
    const text = `${formatMention(member)} `;
    setMention(null);
    apply({
      start: mention.start,
      end: textarea.selectionStart,
      text,
      selectStart: mention.start + text.length,
      selectEnd: mention.start + text.length,
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen && mention) {
      const move = (delta: number) =>
        setMention({ ...mention, active: (mention.active + delta + matches.length) % matches.length });
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        move(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault();
        insertMention(matches[Math.min(mention.active, matches.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'Enter') {
      // preventDefault also keeps global hotkeys (which skip handled events) quiet.
      e.preventDefault();
      onSubmit?.();
      return;
    }
    if (mod && !e.shiftKey && !e.altKey) {
      const kind = SHORTCUTS.get(e.key.toLowerCase());
      if (kind) {
        e.preventDefault();
        format(kind);
        return;
      }
    }
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      onCancel();
    }
  }

  function onContainerBlur(e: FocusEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setMention(null);
    onBlur?.();
  }

  return (
    <div
      className={cn(
        'relative rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
        disabled && 'opacity-50',
        className,
      )}
      onBlur={onContainerBlur}
    >
      {preview ? (
        <div className="min-h-16 px-2.5 py-2" tabIndex={-1}>
          {value.trim() ? (
            <Markdown projectId={projectId} ticketKey={ticketKey}>
              {value}
            </Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview</p>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          aria-label={ariaLabel}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          maxLength={maxLength}
          role={candidates.length > 0 ? 'combobox' : undefined}
          aria-expanded={candidates.length > 0 ? menuOpen : undefined}
          aria-controls={menuOpen ? listId : undefined}
          aria-autocomplete={candidates.length > 0 ? 'list' : undefined}
          aria-activedescendant={menuOpen && mention ? `${listId}-${mention.active}` : undefined}
          onChange={(e) => {
            onChange(e.target.value);
            // Selection is already updated when onChange runs.
            syncMention();
          }}
          onSelect={syncMention}
          onKeyDown={onKeyDown}
          className={cn(
            'field-sizing-content block max-h-[60vh] min-h-16 w-full resize-none bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
            textareaClassName,
          )}
        />
      )}

      {(toolbar || actions) && (
        <div className="flex flex-wrap items-center gap-1 px-1.5 pb-1.5">
          {toolbar && (
            <>
              <div role="tablist" aria-label="Editor mode" className="flex items-center rounded-md bg-muted/60 p-0.5 text-xs">
                {(['Write', 'Preview'] as const).map((mode) => {
                  const selected = (mode === 'Preview') === preview;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => {
                        setMention(null);
                        setPreview(mode === 'Preview');
                        if (mode === 'Write') requestAnimationFrame(() => textareaRef.current?.focus());
                      }}
                      className={cn(
                        'rounded px-2 py-0.5 text-muted-foreground transition-colors hover:text-foreground',
                        selected && 'bg-background text-foreground shadow-xs',
                      )}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
              {!preview && (
                <div role="toolbar" aria-label="Formatting" className="flex items-center">
                  {TOOLBAR.map(({ format: kind, label, icon: Icon, shortcut }) => (
                    <button
                      key={kind}
                      type="button"
                      aria-label={label}
                      title={shortcut ? `${label} (⌘${shortcut.toUpperCase()})` : label}
                      disabled={disabled}
                      // Keep focus + selection in the textarea.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => format(kind)}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none [&_svg]:size-3.5"
                    >
                      <Icon />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
        </div>
      )}

      {menuOpen && mention && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Mention a teammate"
          style={{ left: mention.left, top: mention.top, width: MENU_WIDTH }}
          className="absolute z-50 overflow-hidden rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {matches.map((member, i) => (
            <li
              key={member.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === mention.active}
              // mousedown + preventDefault: pick without blurring the textarea.
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(member);
              }}
              onMouseEnter={() => setMention({ ...mention, active: i })}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5',
                i === mention.active && 'bg-accent text-accent-foreground',
              )}
            >
              <Avatar name={member.name} src={member.image} size={20} />
              <span className="truncate">{member.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
