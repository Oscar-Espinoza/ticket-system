<!--
  Raw markdown mode: autosizing textarea with @mention autocomplete. Used for
  power users (the "Markdown" toggle) and for content the rich editor can't
  represent losslessly. Formatting comes from the shared toolbar via `format`.
  Port of src/components/editor/raw-editor.tsx.

  Imperative handle (React `ref`): bind:this and call `focus()` / `format(kind)`.
-->
<script module lang="ts">
  import type { MarkdownFormat } from '@/components/editor/text-edits';

  export interface RawEditorHandle {
    focus: () => void;
    format: (kind: MarkdownFormat) => void;
  }

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
</script>

<script lang="ts">
  import { focusOnMount } from '@/lib/svelte/focus';
  import { formatMention } from '@/lib/mentions';
  import type { IssueUser } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { formatEdit, mentionQueryAt, type TextEdit } from '@/components/editor/text-edits';
  import MemberOption from './member-option.svelte';
  import { MENU_CLASS, MENU_WIDTH } from './suggestion-entries';

  interface MentionState {
    start: number;
    query: string;
    active: number;
    left: number;
    top: number;
  }

  let {
    value,
    onChange,
    onSubmit,
    onCancel,
    placeholder,
    autoFocus,
    disabled,
    maxLength,
    members,
    class: className,
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
    class?: string;
    'aria-label'?: string;
  } = $props();

  let textarea = $state<HTMLTextAreaElement>();
  let mention = $state<MentionState | null>(null);
  const listId = $props.id();

  const matches = $derived(
    mention
      ? members.filter((m) => m.name.toLowerCase().includes(mention!.query.toLowerCase())).slice(0, MENTION_LIMIT)
      : [],
  );
  const menuOpen = $derived(mention !== null && matches.length > 0);

  /**
   * Position just below the caret, relative to the textarea's offset parent.
   * Rendered inline rather than portaled so it stays inside modal layers (the
   * mobile issue Sheet) instead of counting as an outside click.
   */
  function caretPosition(el: HTMLTextAreaElement, index: number) {
    const style = getComputedStyle(el);
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
    mirror.textContent = el.value.slice(0, index);
    const marker = document.createElement('span');
    marker.textContent = '​';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    const maxLeft = (el.offsetParent?.clientWidth ?? el.clientWidth) - MENU_WIDTH;
    const position = {
      left: Math.max(0, Math.min(el.offsetLeft + marker.offsetLeft - el.scrollLeft, maxLeft)),
      top: el.offsetTop + marker.offsetTop - el.scrollTop + lineHeight + 4,
    };
    mirror.remove();
    return position;
  }

  function apply(edit: TextEdit) {
    const el = textarea;
    if (!el) return;
    el.focus();
    el.setSelectionRange(edit.start, edit.end);
    // insertText keeps the browser's undo stack; fall back to a controlled update.
    const inserted = document.execCommand?.('insertText', false, edit.text);
    if (!inserted) onChange(value.slice(0, edit.start) + edit.text + value.slice(edit.end));
    requestAnimationFrame(() => el.setSelectionRange(edit.selectStart, edit.selectEnd));
  }

  export function format(kind: MarkdownFormat) {
    const el = textarea;
    if (!el || disabled) return;
    apply(formatEdit(el.value, el.selectionStart, el.selectionEnd, kind));
  }

  export function focus() {
    textarea?.focus();
  }

  function syncMention() {
    const el = textarea;
    if (!el || members.length === 0) return;
    const caret = el.selectionStart;
    const found = el.selectionEnd === caret ? mentionQueryAt(el.value, caret) : null;
    if (!found) {
      if (mention) mention = null;
      return;
    }
    if (mention?.start === found.start && mention.query === found.query) return;
    const { left, top } = caretPosition(el, found.start);
    mention = { ...found, active: 0, left, top };
  }

  // React's synthetic onSelect fires whenever the textarea's selection changes
  // (caret moves by keys or mouse, not just the native `select` event), and
  // only when it actually changed. Same here: keyup / mouseup / focus /
  // selectionchange, deduplicated on the selection range.
  let lastSelection = '';
  function onSelectionChange() {
    const el = textarea;
    if (!el) return;
    const next = `${el.selectionStart}:${el.selectionEnd}`;
    if (next === lastSelection) return;
    lastSelection = next;
    syncMention();
  }

  $effect(() => {
    const listener = () => {
      if (document.activeElement === textarea) onSelectionChange();
    };
    document.addEventListener('selectionchange', listener);
    return () => document.removeEventListener('selectionchange', listener);
  });

  function insertMention(member: IssueUser) {
    const el = textarea;
    const current = mention;
    if (!el || !current) return;
    const text = `${formatMention(member)} `;
    mention = null;
    apply({
      start: current.start,
      end: el.selectionStart,
      text,
      selectStart: current.start + text.length,
      selectEnd: current.start + text.length,
    });
  }

  function onkeydown(e: KeyboardEvent) {
    const current = mention;
    if (menuOpen && current) {
      const move = (delta: number) => {
        mention = { ...current, active: (current.active + delta + matches.length) % matches.length };
      };
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        move(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault();
        insertMention(matches[Math.min(current.active, matches.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        mention = null;
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
</script>

<!-- svelte-ignore a11y_autofocus -->
<textarea
  bind:this={textarea}
  {value}
  aria-label={ariaLabel}
  {placeholder}
  autofocus={autoFocus}
  {@attach autoFocus ? focusOnMount : undefined}
  {disabled}
  maxlength={maxLength}
  role={members.length > 0 ? 'combobox' : undefined}
  aria-expanded={members.length > 0 ? menuOpen : undefined}
  aria-controls={menuOpen ? listId : undefined}
  aria-autocomplete={members.length > 0 ? 'list' : undefined}
  aria-activedescendant={menuOpen && mention ? `${listId}-${mention.active}` : undefined}
  oninput={(e) => {
    onChange(e.currentTarget.value);
    // Selection is already updated when the input event runs.
    syncMention();
  }}
  onselect={onSelectionChange}
  onkeyup={onSelectionChange}
  onmouseup={onSelectionChange}
  onfocus={onSelectionChange}
  {onkeydown}
  onblur={(e) => {
    lastSelection = '';
    if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) mention = null;
  }}
  class={cn(
    'field-sizing-content block max-h-[60vh] min-h-16 w-full resize-none bg-transparent px-2.5 py-2 font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-muted-foreground disabled:cursor-not-allowed',
    className,
  )}
></textarea>
{#if menuOpen && mention}
  {@const current = mention}
  <ul
    id={listId}
    role="listbox"
    aria-label="Mention a teammate"
    style="left: {current.left}px; top: {current.top}px; width: {MENU_WIDTH}px"
    class={MENU_CLASS}
  >
    {#each matches as member, i (member.id)}
      <MemberOption
        id={`${listId}-${i}`}
        {member}
        active={i === current.active}
        onPick={() => insertMention(member)}
        onHover={() => (mention = { ...current, active: i })}
      />
    {/each}
  </ul>
{/if}
