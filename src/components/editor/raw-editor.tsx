'use client';

// Raw markdown mode: autosizing textarea with @mention autocomplete. Used for
// power users (the "Markdown" toggle) and for content the rich editor can't
// represent losslessly. Formatting comes from the shared toolbar via `format`.

import { useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from 'react';

import { formatMention } from '@/lib/mentions';
import type { IssueUser } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { MemberOption, MENU_CLASS, MENU_WIDTH } from './suggestion-menu';
import { formatEdit, mentionQueryAt, type MarkdownFormat, type TextEdit } from './text-edits';

const SHORTCUTS = new Map<string, MarkdownFormat>([
  ['b', 'bold'],
  ['i', 'italic'],
  ['e', 'code'],
  ['k', 'link'],
]);
const MENTION_LIMIT = 8;

// Styles copied onto the mirror element that measures the caret position.
const MIRRORED = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
  'textTransform', 'wordSpacing', 'textIndent', 'tabSize',
] as const;

/**
 * Position just below the caret, relative to the textarea's offset parent.
 * Rendered inline rather than portaled so it stays inside modal layers (the
 * mobile issue Sheet) instead of counting as an outside click.
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
  marker.textContent = '​';
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

export interface RawEditorHandle {
  focus: () => void;
  format: (kind: MarkdownFormat) => void;
}

export function RawEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  autoFocus,
  disabled,
  maxLength,
  members,
  className,
  ref,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  maxLength?: number;
  members: readonly IssueUser[];
  className?: string;
  ref?: Ref<RawEditorHandle>;
  'aria-label'?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const listId = useId();

  const matches = mention
    ? members
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

  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus(), format }));

  function syncMention() {
    const textarea = textareaRef.current;
    if (!textarea || members.length === 0) return;
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

  return (
    <>
      <textarea
        ref={textareaRef}
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        maxLength={maxLength}
        role={members.length > 0 ? 'combobox' : undefined}
        aria-expanded={members.length > 0 ? menuOpen : undefined}
        aria-controls={menuOpen ? listId : undefined}
        aria-autocomplete={members.length > 0 ? 'list' : undefined}
        aria-activedescendant={menuOpen && mention ? `${listId}-${mention.active}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          // Selection is already updated when onChange runs.
          syncMention();
        }}
        onSelect={syncMention}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) setMention(null);
        }}
        className={cn(
          'field-sizing-content block max-h-[60vh] min-h-16 w-full resize-none bg-transparent px-2.5 py-2 font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-muted-foreground disabled:cursor-not-allowed',
          className,
        )}
      />
      {menuOpen && mention && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Mention a teammate"
          style={{ left: mention.left, top: mention.top, width: MENU_WIDTH }}
          className={MENU_CLASS}
        >
          {matches.map((member, i) => (
            <MemberOption
              key={member.id}
              id={`${listId}-${i}`}
              member={member}
              active={i === mention.active}
              onPick={() => insertMention(member)}
              onHover={() => setMention({ ...mention, active: i })}
            />
          ))}
        </ul>
      )}
    </>
  );
}
