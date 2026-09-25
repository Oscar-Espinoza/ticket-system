'use client';

// Markdown editor used by descriptions, comments, epic descriptions / updates
// and templates. WYSIWYG (Tiptap) by default with slash commands, @mentions,
// issue references, image paste / drop and embeds; a "Markdown" mode swaps in
// the raw textarea. Plain markdown in, plain markdown out — the value is
// controlled by the caller.

import {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { useEditorState, type AnyExtension, type Editor } from '@tiptap/react';
import {
  Bold,
  Code,
  ImageIcon,
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
import type { IssueUser } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { useRichEditorContext, type EditorIssue } from './context';
import { RawEditor, type RawEditorHandle } from './raw-editor';
import { RichEditor, type RichEditorHandle } from './rich-editor';
import type { MarkdownFormat } from './text-edits';

const TOOLBAR: { format: MarkdownFormat; label: string; icon: LucideIcon; shortcut?: string }[] = [
  { format: 'bold', label: 'Bold', icon: Bold, shortcut: 'B' },
  { format: 'italic', label: 'Italic', icon: Italic, shortcut: 'I' },
  { format: 'code', label: 'Inline code', icon: Code, shortcut: 'E' },
  { format: 'link', label: 'Link', icon: Link, shortcut: 'K' },
  { format: 'bullet', label: 'Bulleted list', icon: List },
  { format: 'numbered', label: 'Numbered list', icon: ListOrdered },
  { format: 'task', label: 'Checklist', icon: ListTodo },
  { format: 'quote', label: 'Quote', icon: Quote },
  { format: 'codeblock', label: 'Code block', icon: SquareCode },
];

const RICH_ACTIVE: Record<MarkdownFormat, string> = {
  bold: 'bold',
  italic: 'italic',
  code: 'code',
  link: 'link',
  bullet: 'bulletList',
  numbered: 'orderedList',
  task: 'taskList',
  quote: 'blockquote',
  codeblock: 'codeBlock',
};

function runRich(editor: Editor, format: MarkdownFormat) {
  const chain = editor.chain().focus();
  const commands: Record<Exclude<MarkdownFormat, 'link'>, () => boolean> = {
    bold: () => chain.toggleBold().run(),
    italic: () => chain.toggleItalic().run(),
    code: () => chain.toggleCode().run(),
    bullet: () => chain.toggleBulletList().run(),
    numbered: () => chain.toggleOrderedList().run(),
    task: () => chain.toggleTaskList().run(),
    quote: () => chain.toggleBlockquote().run(),
    codeblock: () => chain.toggleCodeBlock().run(),
  };
  if (format !== 'link') commands[format]();
}

// The viewer's preferred mode, shared by every editor on the page.
type Mode = 'rich' | 'markdown';
const MODE_KEY = 'editor:mode';
const modeListeners = new Set<() => void>();

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'markdown' ? 'markdown' : 'rich';
  } catch {
    return 'rich';
  }
}

function writeMode(mode: Mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Private mode / blocked storage: the choice just doesn't persist.
  }
  modeListeners.forEach((listener) => listener());
}

function subscribeMode(listener: () => void) {
  modeListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    modeListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** A typed link: bare hosts get https://; only web, mail and in-app links pass. */
function normalizeHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export interface MarkdownEditorHandle {
  focus: () => void;
  /** The Tiptap editor in rich mode (null in Markdown mode / before mount). */
  editor: Editor | null;
}

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** ⌘Enter / Ctrl+Enter. */
  onSubmit?: () => void;
  /** Esc (after closing an open suggestion menu). */
  onCancel?: () => void;
  /** Focus left the whole editor (toolbar and menus count as inside). */
  onBlur?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  maxLength?: number;
  /** @mention candidates; defaults to the current project's members. */
  members?: IssueUser[];
  /** Upload + issue-key scope; defaults to RichEditorProvider, then the current project. */
  projectId?: string;
  ticketKey?: string;
  /** Issue context: pasted images become attachments of this issue. */
  ticketId?: string;
  /** `#` candidates; otherwise fetched from the server for `projectId`. */
  issues?: readonly EditorIssue[];
  /** Show the formatting toolbar + mode toggle (default true). */
  toolbar?: boolean;
  /** Right side of the footer, e.g. Cancel / Submit buttons. */
  actions?: ReactNode;
  className?: string;
  /** Classes for the editable area (e.g. a min height). */
  textareaClassName?: string;
  /** Extra Tiptap extensions (memoize the array — a new identity rebuilds the editor). */
  extensions?: AnyExtension[];
  /** Built-in undo history (default true); pass false with Collaboration. */
  history?: boolean;
  /**
   * Default true. False: `value` is ignored after mount and the document is
   * owned by an extension (Yjs); `onChange` still receives markdown snapshots.
   */
  controlled?: boolean;
  onEditor?: (editor: Editor | null) => void;
  ref?: Ref<MarkdownEditorHandle>;
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
  projectId: projectIdProp,
  ticketKey: ticketKeyProp,
  ticketId: ticketIdProp,
  issues: issuesProp,
  toolbar = true,
  actions,
  className,
  textareaClassName,
  extensions: extensionsProp,
  history: historyProp,
  controlled = true,
  onEditor,
  ref,
  'aria-label': ariaLabel,
}: MarkdownEditorProps) {
  const projectData = useOptionalProjectData();
  const context = useRichEditorContext();
  const candidates = members ?? projectData?.members ?? [];
  const projectId = projectIdProp ?? context?.projectId ?? projectData?.project.id;
  const ticketKey =
    ticketKeyProp ?? (projectData && projectData.project.id === projectId ? projectData.project.ticketKey : undefined);
  const ticketId = ticketIdProp ?? context?.ticketId;
  const issues = issuesProp ?? context?.issues;
  const extensions = extensionsProp ?? context?.extensions;
  const history = historyProp ?? context?.history ?? true;
  // Collaboration owns the document; the textarea can't edit it.
  const rawAllowed = controlled;

  const preferred = useSyncExternalStore(subscribeMode, readMode, () => 'rich' as Mode);
  const [lossy, setLossy] = useState(false);
  const mode: Mode = rawAllowed && (lossy || preferred === 'markdown') ? 'markdown' : 'rich';

  const richRef = useRef<RichEditorHandle>(null);
  const rawRef = useRef<RawEditorHandle>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const handleEditor = useCallback(
    (instance: Editor | null) => {
      setEditor(instance);
      onEditor?.(instance);
    },
    [onEditor],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => (mode === 'rich' ? richRef.current?.focus() : rawRef.current?.focus()),
      editor: mode === 'rich' ? editor : null,
    }),
    [mode, editor],
  );

  const active = useEditorState({
    editor: mode === 'rich' ? editor : null,
    selector: ({ editor: current }) => {
      if (!current) return null;
      const state = {} as Record<MarkdownFormat, boolean>;
      for (const [format, name] of Object.entries(RICH_ACTIVE)) {
        state[format as MarkdownFormat] = current.isActive(name);
      }
      return state;
    },
  });

  const openLink = () => {
    if (!editor || disabled) return;
    const href = editor.getAttributes('link').href;
    setLink(typeof href === 'string' ? href : '');
    requestAnimationFrame(() => linkInputRef.current?.select());
  };

  const closeLink = () => {
    setLink(null);
    editor?.commands.focus();
  };

  const applyLink = () => {
    if (!editor || link === null) return;
    const href = normalizeHref(link);
    if (href === null) {
      linkInputRef.current?.setCustomValidity('Enter a web or email address.');
      linkInputRef.current?.reportValidity();
      return;
    }
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!href) chain.unsetLink().run();
    else if (editor.state.selection.empty && !editor.isActive('link')) {
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else chain.setLink({ href }).run();
    setLink(null);
  };

  function format(kind: MarkdownFormat) {
    if (disabled) return;
    if (mode === 'markdown') {
      rawRef.current?.format(kind);
      return;
    }
    if (!editor) return;
    if (kind === 'link') openLink();
    else runRich(editor, kind);
  }

  function switchMode(next: Mode) {
    setLink(null);
    if (next === 'rich') setLossy(false);
    writeMode(next);
    requestAnimationFrame(() => (next === 'rich' ? richRef.current?.focus() : rawRef.current?.focus()));
  }

  function onContainerBlur(e: FocusEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    // The window lost focus (file picker, app switch): still editing.
    if (!document.hasFocus()) return;
    setLink(null);
    onBlur?.();
  }

  const canUploadImages = mode === 'rich' && !!projectId && !disabled;

  return (
    <div
      className={cn(
        'relative rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
        disabled && 'opacity-50',
        className,
      )}
      onBlur={onContainerBlur}
    >
      {mode === 'rich' ? (
        <RichEditor
          ref={richRef}
          value={value}
          onChange={onChange}
          onLossy={() => setLossy(true)}
          onSubmit={onSubmit}
          onCancel={onCancel}
          onOpenLink={openLink}
          onEditor={handleEditor}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          maxLength={maxLength}
          members={candidates}
          issues={issues}
          projectId={projectId}
          ticketId={ticketId}
          ticketKey={ticketKey}
          extensions={extensions}
          history={history}
          controlled={controlled}
          className={textareaClassName}
          aria-label={ariaLabel}
        />
      ) : (
        <RawEditor
          ref={rawRef}
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          onCancel={onCancel}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          maxLength={maxLength}
          members={candidates}
          className={textareaClassName}
          aria-label={ariaLabel}
        />
      )}

      {lossy && mode === 'markdown' && (
        <p className="px-2.5 pb-1 text-xs text-muted-foreground">
          This text uses Markdown the rich editor can’t show (tables, HTML…), so it’s edited as Markdown.
        </p>
      )}

      {link !== null ? (
        <div className="flex items-center gap-1.5 px-1.5 pb-1.5">
          <Link className="ml-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={linkInputRef}
            value={link}
            aria-label="Link address"
            placeholder="Paste a link…"
            onChange={(e) => {
              e.currentTarget.setCustomValidity('');
              setLink(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeLink();
              }
            }}
            className="h-6 min-w-0 flex-1 rounded-md bg-muted/60 px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <button
            type="button"
            onClick={applyLink}
            className="h-6 rounded-md px-2 text-xs font-medium text-foreground hover:bg-muted"
          >
            {link.trim() ? 'Apply' : 'Remove'}
          </button>
        </div>
      ) : (
        (toolbar || actions) && (
          <div className="flex flex-wrap items-center gap-1 px-1.5 pb-1.5">
            {toolbar && (
              <>
                {rawAllowed && (
                  <div role="tablist" aria-label="Editor mode" className="flex items-center rounded-md bg-muted/60 p-0.5 text-xs">
                    {(['rich', 'markdown'] as const).map((option) => {
                      const selected = option === mode;
                      return (
                        <button
                          key={option}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          title={option === 'rich' ? 'Rich text editor' : 'Edit the raw Markdown'}
                          onClick={() => !selected && switchMode(option)}
                          className={cn(
                            'rounded px-2 py-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                            selected && 'bg-background text-foreground shadow-xs',
                          )}
                        >
                          {option === 'rich' ? 'Editor' : 'Markdown'}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div role="toolbar" aria-label="Formatting" className="flex items-center">
                  {TOOLBAR.map(({ format: kind, label, icon: Icon, shortcut }) => (
                    <ToolbarButton
                      key={kind}
                      label={label}
                      shortcut={shortcut}
                      pressed={mode === 'rich' ? (active?.[kind] ?? false) : undefined}
                      disabled={disabled}
                      onClick={() => format(kind)}
                    >
                      <Icon />
                    </ToolbarButton>
                  ))}
                  {canUploadImages && (
                    <ToolbarButton
                      label="Image"
                      title="Image (or paste / drop one)"
                      onClick={() => richRef.current?.pickImage()}
                    >
                      <ImageIcon />
                    </ToolbarButton>
                  )}
                </div>
              </>
            )}
            {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
          </div>
        )
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  title,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  shortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? (shortcut ? `${label} (⌘${shortcut})` : label)}
      disabled={disabled}
      // Keep focus + selection in the editor.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none [&_svg]:size-3.5',
        pressed && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  );
}
