'use client';

// Tiptap 3 WYSIWYG surface behind MarkdownEditor. Markdown in / markdown out:
// the doc is loaded from `value` whenever it differs from what this editor last
// emitted, and every change is serialized back (tidied for Slack / email).
// Suggestion menus render inline in the editor root, not portaled, so they stay
// inside modal layers (the mobile issue Sheet, dialogs).

import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';
import { EditorContent, useEditor, type AnyExtension, type Editor } from '@tiptap/react';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { toast } from 'sonner';

import type { IssueUser } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { suggestIssues } from './actions';
import type { EditorIssue } from './context';
import { createExtensions, uploadFilesAtCaret, type EditorRuntime, type MenuKind } from './extensions';
import { PROSE_BASE } from './markdown';
import { keepsText, normalizeParsed, tidyMarkdown } from './markdown-io';
import { MENU_WIDTH, SuggestionMenu, type SuggestionEntry } from './suggestion-menu';
import { uploadImage, type UploadTarget } from './upload';

const ISSUE_LIMIT = 8;
const OPTION_HEIGHT = 32;

const EDITOR_CLASS = cn(
  PROSE_BASE,
  'block max-h-[60vh] min-h-16 w-full overflow-y-auto px-2.5 py-2 outline-none',
  '[&_li>p]:my-0 [&_li]:pl-0.5',
  '[&_.task-list]:list-none [&_.task-list]:pl-0.5 [&_.task-item]:flex [&_.task-item]:items-start [&_.task-item]:gap-2',
  '[&_.task-item>label]:mt-[3px] [&_.task-item>label]:shrink-0 [&_.task-item>div]:min-w-0 [&_.task-item>div]:flex-1',
  '[&_input[type=checkbox]]:size-3.5 [&_input[type=checkbox]]:accent-primary',
  '[&_img.ProseMirror-selectednode]:ring-2 [&_img.ProseMirror-selectednode]:ring-ring/60',
  '[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
);

export function serializeMarkdown(editor: Editor): string {
  return tidyMarkdown(editor.getMarkdown());
}

/** Load markdown; false (nothing changed) when the round trip would drop text. */
function loadMarkdown(editor: Editor, markdown: string): boolean {
  if (!markdown.trim()) {
    editor.commands.clearContent(false);
    return true;
  }
  const manager = editor.markdown;
  if (!manager) return false;
  try {
    const doc = normalizeParsed(manager.parse(markdown));
    if (!keepsText(markdown, tidyMarkdown(manager.serialize(doc)))) return false;
    editor.commands.setContent(doc, { emitUpdate: false });
    return true;
  } catch {
    return false;
  }
}

function filterIssues(issues: readonly EditorIssue[], query: string): EditorIssue[] {
  const q = query.trim().toLowerCase();
  const out: EditorIssue[] = [];
  for (const issue of issues) {
    if (!q || issue.key.toLowerCase().includes(q) || issue.title.toLowerCase().includes(q)) out.push(issue);
    if (out.length >= ISSUE_LIMIT) break;
  }
  return out;
}

class RuntimeBridge {
  private value: EditorRuntime | null = null;
  get current(): EditorRuntime {
    if (!this.value) throw new Error('Editor runtime used before mount');
    return this.value;
  }
  set(value: EditorRuntime) {
    this.value = value;
  }
}

interface MenuState {
  kind: MenuKind;
  query: string;
  entries: SuggestionEntry[];
  loading: boolean;
  command: (entry: SuggestionEntry) => void;
  style: CSSProperties;
  active: number;
}

export interface RichEditorHandle {
  focus: () => void;
  /** Open the file picker; picked images upload at the caret. */
  pickImage: () => void;
  editor: Editor | null;
}

export interface RichEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  /** The value can't be shown without losing text; the host switches to raw mode. */
  onLossy: () => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  onOpenLink: () => void;
  onEditor?: (editor: Editor | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  maxLength?: number;
  members: readonly IssueUser[];
  issues?: readonly EditorIssue[];
  projectId?: string;
  ticketId?: string;
  ticketKey?: string;
  extensions?: AnyExtension[];
  history: boolean;
  controlled: boolean;
  className?: string;
  ref?: Ref<RichEditorHandle>;
  'aria-label'?: string;
}

export function RichEditor({
  value,
  onChange,
  onLossy,
  onSubmit,
  onCancel,
  onOpenLink,
  onEditor,
  placeholder,
  autoFocus,
  disabled,
  maxLength,
  members,
  issues,
  projectId,
  ticketId,
  ticketKey,
  extensions,
  history,
  controlled,
  className,
  ref,
  'aria-label': ariaLabel,
}: RichEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const [menu, setMenuState] = useState<MenuState | null>(null);
  const menuRef = useRef<MenuState | null>(null);
  const setMenu = (next: MenuState | null) => {
    menuRef.current = next;
    setMenuState(next);
  };

  const uploadTarget: UploadTarget | null = projectId ? { projectId, ticketId } : null;

  // Everything the (once-built) extensions call back into; refreshed each render.
  const runtime: EditorRuntime = {
    members: () => members,
    searchIssues: (query) => {
      if (issues) return filterIssues(issues, query);
      if (!projectId) return [];
      return suggestIssues({ projectId, query }).catch(() => []);
    },
    upload: uploadTarget ? (file) => uploadImage(uploadTarget, file) : null,
    pickImage: () => fileRef.current?.click(),
    notify: (error) => toast.error(error),
    placeholder: () => placeholder ?? '',
    submit: () => onSubmit?.(),
    cancel: () => {
      if (!onCancel) return false;
      onCancel();
      return true;
    },
    openLink: onOpenLink,
    menu: {
      show: (kind, props) => showMenu(kind, props),
      hide: (kind) => {
        if (menuRef.current?.kind === kind) setMenu(null);
      },
      keyDown: (props) => menuKeyDown(props),
    },
  };
  // A plain holder (not a ref): the extensions are built during render and
  // only read it later, from editor callbacks.
  const [bridge] = useState(() => new RuntimeBridge());
  useLayoutEffect(() => {
    bridge.set(runtime);
  });
  const onChangeRef = useRef(onChange);
  const onLossyRef = useRef(onLossy);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    onLossyRef.current = onLossy;
  });

  function showMenu(kind: MenuKind, props: SuggestionProps<SuggestionEntry, SuggestionEntry>) {
    const wrapper = wrapperRef.current;
    const rect = props.clientRect?.();
    // "Searching…" only once something was typed, so a bare `#` (heading) stays quiet.
    const searching = props.loading && props.query.length > 0;
    if (!wrapper || !rect || (props.items.length === 0 && !searching)) {
      if (menuRef.current?.kind === kind) setMenu(null);
      return;
    }
    const box = wrapper.getBoundingClientRect();
    const left = Math.max(0, Math.min(rect.left - box.left, box.width - MENU_WIDTH));
    const height = Math.min(288, 8 + Math.max(1, props.items.length) * OPTION_HEIGHT);
    // Open upward when the list would run past the bottom of the viewport.
    const above = rect.bottom + height + 8 > window.innerHeight && rect.top - height - 8 > 0;
    const style: CSSProperties = above
      ? { left, bottom: box.bottom - rect.top + 4 }
      : { left, top: rect.bottom - box.top + 4 };
    const prev = menuRef.current;
    const keep = prev?.kind === kind && prev.query === props.query;
    setMenu({
      kind,
      query: props.query,
      entries: props.items,
      loading: searching,
      command: props.command,
      style,
      active: keep ? Math.min(prev.active, Math.max(0, props.items.length - 1)) : 0,
    });
  }

  function menuKeyDown({ event }: SuggestionKeyDownProps): boolean {
    const current = menuRef.current;
    if (!current || current.entries.length === 0) return false;
    const count = current.entries.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setMenu({ ...current, active: (current.active + delta + count) % count });
      return true;
    }
    if ((event.key === 'Enter' && !event.metaKey && !event.ctrlKey) || event.key === 'Tab') {
      current.command(current.entries[current.active]);
      return true;
    }
    return false;
  }

  const emitted = useRef<string | null>(null);
  const loadedInto = useRef<Editor | null>(null);
  const tiptapExtensions = useMemo(
    () => createExtensions(bridge, {
        ticketKey: ticketKey ?? null,
        history,
        // Collaborative docs sync remote steps that must never be filtered out.
        maxLength: controlled ? maxLength : undefined,
        extra: extensions,
      }),
    [bridge, ticketKey, history, maxLength, controlled, extensions],
  );
  const editor = useEditor(
    {
      extensions: tiptapExtensions,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editable: !disabled,
      editorProps: {
        attributes: {
          class: cn(EDITOR_CLASS, className),
          role: 'textbox',
          'aria-multiline': 'true',
          ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
        },
      },
      onUpdate: ({ editor: current }) => {
        const markdown = serializeMarkdown(current);
        emitted.current = markdown;
        onChangeRef.current(markdown);
      },
    },
    // Rebuilt only when the schema-level setup changes; hosts memoize `extensions`.
    [tiptapExtensions],
  );

  useEffect(() => {
    if (!editor || !controlled) return;
    if (loadedInto.current === editor && value === emitted.current) return;
    const first = loadedInto.current !== editor;
    loadedInto.current = editor;
    emitted.current = value;
    if (!loadMarkdown(editor, value)) {
      onLossyRef.current();
      return;
    }
    if (first && autoFocus) editor.commands.focus('end');
  }, [editor, value, controlled, autoFocus]);

  useEffect(() => {
    if (editor && !controlled && autoFocus) editor.commands.focus('end');
  }, [editor, controlled, autoFocus]);

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  useEffect(() => {
    if (!onEditor) return;
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

  // Combobox semantics for screen readers while a suggestion list is open.
  const activeOption = menu && menu.entries.length > 0 ? `${menuId}-${menu.active}` : null;
  useEffect(() => {
    const dom = editor?.view.dom;
    if (!dom) return;
    if (activeOption) {
      dom.setAttribute('aria-controls', menuId);
      dom.setAttribute('aria-activedescendant', activeOption);
    } else {
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
    }
  }, [editor, menuId, activeOption]);

  useImperativeHandle(
    ref,
    () => ({ focus: () => editor?.commands.focus(), pickImage: () => fileRef.current?.click(), editor }),
    [editor],
  );

  return (
    <div ref={wrapperRef} className="relative">
      <EditorContent editor={editor} />
      {!editor && <div aria-hidden className={cn('min-h-16', className)} />}
      {menu && (
        <SuggestionMenu
          id={menuId}
          entries={menu.entries}
          active={menu.active}
          loading={menu.loading}
          style={menu.style}
          onPick={(entry) => menu.command(entry)}
          onHover={(index) => {
            if (menuRef.current && menuRef.current.active !== index) setMenu({ ...menuRef.current, active: index });
          }}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
        multiple
        hidden
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = '';
          if (editor && files.length > 0) uploadFilesAtCaret(editor, bridge.current, files);
        }}
      />
    </div>
  );
}
