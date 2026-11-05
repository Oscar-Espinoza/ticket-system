<!--
  Markdown editor used by descriptions, comments, epic descriptions / updates
  and templates (port of src/components/editor/markdown-editor.tsx). WYSIWYG
  (Tiptap) by default with slash commands, @mentions, issue references, image
  paste / drop and embeds; a "Markdown" mode swaps in the raw textarea. Plain
  markdown in, plain markdown out — the value is controlled by the caller.

  Svelte differences: `actions` is a snippet; `className` → `class`; the
  imperative handle (React `ref`) is bind:this + `focus()` / `getEditor()`.
-->
<script module lang="ts">
  import type { Snippet } from 'svelte';
  import { createSubscriber } from 'svelte/reactivity';
  import type { AnyExtension, Editor } from '@tiptap/core';
  import type { LucideIcon } from '@lucide/svelte';
  import Bold from '@lucide/svelte/icons/bold';
  import Code from '@lucide/svelte/icons/code';
  import Italic from '@lucide/svelte/icons/italic';
  import Link from '@lucide/svelte/icons/link';
  import List from '@lucide/svelte/icons/list';
  import ListOrdered from '@lucide/svelte/icons/list-ordered';
  import ListTodo from '@lucide/svelte/icons/list-todo';
  import Quote from '@lucide/svelte/icons/quote';
  import SquareCode from '@lucide/svelte/icons/square-code';

  import type { IssueUser } from '@/lib/issue-model';
  import type { MarkdownFormat } from '@/components/editor/text-edits';
  import type { EditorIssue } from './context.svelte';

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
  const MODES: readonly Mode[] = ['rich', 'markdown'];
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

  // useSyncExternalStore(subscribeMode, readMode) → a shared subscriber.
  const trackMode = createSubscriber((update) => subscribeMode(update));

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
    getEditor: () => Editor | null;
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
    actions?: Snippet;
    class?: string;
    /** Classes for the editable area (e.g. a min height). */
    textareaClassName?: string;
    /** Extra Tiptap extensions (keep the array identity stable — a new one rebuilds the editor). */
    extensions?: AnyExtension[];
    /** Built-in undo history (default true); pass false with Collaboration. */
    history?: boolean;
    /**
     * Default true. False: `value` is ignored after mount and the document is
     * owned by an extension (Yjs); `onChange` still receives markdown snapshots.
     */
    controlled?: boolean;
    onEditor?: (editor: Editor | null) => void;
    'aria-label'?: string;
  }
</script>

<script lang="ts">
  import ImageIcon from '@lucide/svelte/icons/image';

  import { useOptionalProjectData } from '@/lib/components/project/project-data.svelte';
  import { isAppHydrated, markAppHydrated } from '@/lib/svelte/hydration';
  import { cn } from '@/lib/utils';
  import { useRichEditorContext } from './context.svelte';
  import RawEditor from './raw-editor.svelte';
  import RichEditor from './rich-editor.svelte';
  import ToolbarButton from './toolbar-button.svelte';

  let {
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
    class: className,
    textareaClassName,
    extensions: extensionsProp,
    history: historyProp,
    controlled = true,
    onEditor,
    'aria-label': ariaLabel,
  }: MarkdownEditorProps = $props();

  const projectData = useOptionalProjectData();
  const context = useRichEditorContext();
  const candidates = $derived(members ?? projectData?.members ?? []);
  const projectId = $derived(projectIdProp ?? context?.projectId ?? projectData?.project.id);
  const ticketKey = $derived(
    ticketKeyProp ?? (projectData && projectData.project.id === projectId ? projectData.project.ticketKey : undefined),
  );
  const ticketId = $derived(ticketIdProp ?? context?.ticketId);
  const issues = $derived(issuesProp ?? context?.issues);
  const extensions = $derived(extensionsProp ?? context?.extensions);
  const history = $derived(historyProp ?? context?.history ?? true);
  // Collaboration owns the document; the textarea can't edit it.
  const rawAllowed = $derived(controlled);

  // Server snapshot ('rich') during hydration, then the stored preference.
  let hydrated = $state(isAppHydrated());
  $effect(() => {
    hydrated = true;
    markAppHydrated();
  });
  const preferred = $derived.by<Mode>(() => {
    if (!hydrated) return 'rich';
    trackMode();
    return readMode();
  });
  let lossy = $state(false);
  const mode = $derived<Mode>(rawAllowed && (lossy || preferred === 'markdown') ? 'markdown' : 'rich');

  let rich = $state<ReturnType<typeof RichEditor>>();
  let raw = $state<ReturnType<typeof RawEditor>>();
  let editor = $state.raw<Editor | null>(null);
  let link = $state<string | null>(null);
  let linkInput = $state<HTMLInputElement>();

  function handleEditor(instance: Editor | null) {
    editor = instance;
    onEditor?.(instance);
  }

  export function focus() {
    if (mode === 'rich') rich?.focus();
    else raw?.focus();
  }

  export function getEditor(): Editor | null {
    return mode === 'rich' ? editor : null;
  }

  // useEditorState: re-read the active marks/nodes on every transaction.
  let tx = $state(0);
  let txCount = 0;
  $effect(() => {
    const current = mode === 'rich' ? editor : null;
    if (!current) return;
    const bump = () => {
      tx = ++txCount;
    };
    current.on('transaction', bump);
    return () => {
      current.off('transaction', bump);
    };
  });
  const active = $derived.by(() => {
    void tx;
    const current = mode === 'rich' ? editor : null;
    if (!current || current.isDestroyed) return null;
    const state = {} as Record<MarkdownFormat, boolean>;
    for (const [format, name] of Object.entries(RICH_ACTIVE)) {
      state[format as MarkdownFormat] = current.isActive(name);
    }
    return state;
  });

  function openLink() {
    if (!editor || disabled) return;
    const href = editor.getAttributes('link').href;
    link = typeof href === 'string' ? href : '';
    requestAnimationFrame(() => linkInput?.select());
  }

  function closeLink() {
    link = null;
    editor?.commands.focus();
  }

  function applyLink() {
    if (!editor || link === null) return;
    const href = normalizeHref(link);
    if (href === null) {
      linkInput?.setCustomValidity('Enter a web or email address.');
      linkInput?.reportValidity();
      return;
    }
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!href) chain.unsetLink().run();
    else if (editor.state.selection.empty && !editor.isActive('link')) {
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else chain.setLink({ href }).run();
    link = null;
  }

  function format(kind: MarkdownFormat) {
    if (disabled) return;
    if (mode === 'markdown') {
      raw?.format(kind);
      return;
    }
    if (!editor) return;
    if (kind === 'link') openLink();
    else runRich(editor, kind);
  }

  function switchMode(next: Mode) {
    link = null;
    if (next === 'rich') lossy = false;
    writeMode(next);
    requestAnimationFrame(() => (next === 'rich' ? rich?.focus() : raw?.focus()));
  }

  // React's onBlur on the container is the bubbling focusout.
  function onContainerFocusOut(e: FocusEvent & { currentTarget: HTMLDivElement }) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    // The window lost focus (file picker, app switch): still editing.
    if (!document.hasFocus()) return;
    link = null;
    onBlur?.();
  }

  const canUploadImages = $derived(mode === 'rich' && !!projectId && !disabled);
</script>

<div
  class={cn(
    'relative rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
    disabled && 'opacity-50',
    className,
  )}
  onfocusout={onContainerFocusOut}
>
  {#if mode === 'rich'}
    <RichEditor
      bind:this={rich}
      {value}
      {onChange}
      onLossy={() => (lossy = true)}
      {onSubmit}
      {onCancel}
      onOpenLink={openLink}
      onEditor={handleEditor}
      {placeholder}
      {autoFocus}
      {disabled}
      {maxLength}
      members={candidates}
      {issues}
      {projectId}
      {ticketId}
      {ticketKey}
      {extensions}
      {history}
      {controlled}
      class={textareaClassName}
      aria-label={ariaLabel}
    />
  {:else}
    <RawEditor
      bind:this={raw}
      {value}
      {onChange}
      {onSubmit}
      {onCancel}
      {placeholder}
      {autoFocus}
      {disabled}
      {maxLength}
      members={candidates}
      class={textareaClassName}
      aria-label={ariaLabel}
    />
  {/if}

  {#if lossy && mode === 'markdown'}
    <p class="px-2.5 pb-1 text-xs text-muted-foreground">
      This text uses Markdown the rich editor can’t show (tables, HTML…), so it’s edited as Markdown.
    </p>
  {/if}

  {#if link !== null}
    <div class="flex items-center gap-1.5 px-1.5 pb-1.5">
      <Link class="ml-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        bind:this={linkInput}
        value={link}
        aria-label="Link address"
        placeholder="Paste a link…"
        oninput={(e) => {
          e.currentTarget.setCustomValidity('');
          link = e.currentTarget.value;
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            applyLink();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeLink();
          }
        }}
        class="h-6 min-w-0 flex-1 rounded-md bg-muted/60 px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <button
        type="button"
        onclick={applyLink}
        class="h-6 rounded-md px-2 text-xs font-medium text-foreground hover:bg-muted"
      >
        {link.trim() ? 'Apply' : 'Remove'}
      </button>
    </div>
  {:else if toolbar || actions}
    <div class="flex flex-wrap items-center gap-1 px-1.5 pb-1.5">
      {#if toolbar}
        {#if rawAllowed}
          <div role="tablist" aria-label="Editor mode" class="flex items-center rounded-md bg-muted/60 p-0.5 text-xs">
            {#each MODES as option (option)}
              {@const selected = option === mode}
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                title={option === 'rich' ? 'Rich text editor' : 'Edit the raw Markdown'}
                onclick={() => !selected && switchMode(option)}
                class={cn(
                  'rounded px-2 py-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  selected && 'bg-background text-foreground shadow-xs',
                )}
              >
                {option === 'rich' ? 'Editor' : 'Markdown'}
              </button>
            {/each}
          </div>
        {/if}
        <div role="toolbar" aria-label="Formatting" class="flex items-center">
          {#each TOOLBAR as { format: kind, label, icon: Icon, shortcut } (kind)}
            <ToolbarButton
              {label}
              {shortcut}
              pressed={mode === 'rich' ? (active?.[kind] ?? false) : undefined}
              {disabled}
              onClick={() => format(kind)}
            >
              <Icon />
            </ToolbarButton>
          {/each}
          {#if canUploadImages}
            <ToolbarButton label="Image" title="Image (or paste / drop one)" onClick={() => rich?.pickImage()}>
              <ImageIcon />
            </ToolbarButton>
          {/if}
        </div>
      {/if}
      {#if actions}
        <div class="ml-auto flex items-center gap-1.5">{@render actions()}</div>
      {/if}
    </div>
  {/if}
</div>
