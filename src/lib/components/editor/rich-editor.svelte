<!--
  Tiptap 3 WYSIWYG surface behind MarkdownEditor. Markdown in / markdown out: the doc is
  loaded from `value` whenever it differs from what this editor last emitted,
  and every change is serialized back (tidied for Slack / email). Suggestion
  menus render inline in the editor root, not portaled, so they stay inside
  modal layers (the mobile issue Sheet, dialogs).

  @tiptap/core is driven directly (no useEditor): the editor is created in an
  effect once the host element exists (never during SSR — React's
  `immediatelyRender: false`) and rebuilt only when the schema-level setup
  changes (ticketKey, history, maxLength, controlled, extensions), like
  useEditor's deps. Imperative handle (React `ref`): bind:this and call
  `focus()`, `pickImage()`, `getEditor()`.
-->
<script module lang="ts">
  import type { AnyExtension, Editor } from '@tiptap/core';

  import type { IssueUser } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import type { EditorIssue } from './context.svelte';
  import { PROSE_BASE } from './markdown-plugins';
  import { keepsText, normalizeParsed, tidyMarkdown } from './markdown-io';

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

  export interface RichEditorHandle {
    focus: () => void;
    /** Open the file picker; picked images upload at the caret. */
    pickImage: () => void;
    getEditor: () => Editor | null;
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
    class?: string;
    'aria-label'?: string;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { Editor as TiptapEditor } from '@tiptap/core';
  import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
  import { toast } from 'svelte-sonner';

  import { uploadImage, type UploadTarget } from '@/lib/components/editor/upload';
  import { suggestIssues } from '@/lib/actions/editor';
  import { createExtensions, uploadFilesAtCaret, type EditorRuntime, type MenuKind } from './extensions';
  import SuggestionMenu from './suggestion-menu.svelte';
  import { MENU_WIDTH, type SuggestionEntry } from './suggestion-entries';

  interface MenuState {
    kind: MenuKind;
    query: string;
    entries: SuggestionEntry[];
    loading: boolean;
    command: (entry: SuggestionEntry) => void;
    style: string;
    active: number;
  }

  let {
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
    class: className,
    'aria-label': ariaLabel,
  }: RichEditorProps = $props();

  let wrapper = $state<HTMLDivElement>();
  let host = $state<HTMLDivElement>();
  let fileInput = $state<HTMLInputElement>();
  const menuId = $props.id();
  // Raw: holds Tiptap's command callback and suggestion items, never proxied.
  let menu = $state.raw<MenuState | null>(null);
  let editor = $state.raw<TiptapEditor | null>(null);

  const uploadTarget = $derived<UploadTarget | null>(projectId ? { projectId, ticketId } : null);

  // Everything the (once-built) extensions call back into. Its members read the
  // latest props when called, so it never needs refreshing (React rebuilt it
  // each render behind a RuntimeBridge).
  const runtime: EditorRuntime = {
    members: () => members,
    searchIssues: (query) => {
      if (issues) return filterIssues(issues, query);
      if (!projectId) return [];
      return suggestIssues({ projectId, query }).catch(() => []);
    },
    get upload() {
      const target = uploadTarget;
      return target ? (file: File) => uploadImage(target, file) : null;
    },
    pickImage: () => fileInput?.click(),
    notify: (error) => toast.error(error),
    placeholder: () => placeholder ?? '',
    submit: () => onSubmit?.(),
    cancel: () => {
      if (!onCancel) return false;
      onCancel();
      return true;
    },
    openLink: () => onOpenLink(),
    menu: {
      show: (kind, props) => showMenu(kind, props),
      hide: (kind) => {
        if (menu?.kind === kind) menu = null;
      },
      keyDown: (props) => menuKeyDown(props),
    },
  };
  const bridge = { current: runtime } as const;

  function showMenu(kind: MenuKind, props: SuggestionProps<SuggestionEntry, SuggestionEntry>) {
    const box = wrapper?.getBoundingClientRect();
    const rect = props.clientRect?.();
    // "Searching…" only once something was typed, so a bare `#` (heading) stays quiet.
    const searching = props.loading && props.query.length > 0;
    if (!box || !rect || (props.items.length === 0 && !searching)) {
      if (menu?.kind === kind) menu = null;
      return;
    }
    const left = Math.max(0, Math.min(rect.left - box.left, box.width - MENU_WIDTH));
    const height = Math.min(288, 8 + Math.max(1, props.items.length) * OPTION_HEIGHT);
    // Open upward when the list would run past the bottom of the viewport.
    const above = rect.bottom + height + 8 > window.innerHeight && rect.top - height - 8 > 0;
    const style = above
      ? `left: ${left}px; bottom: ${box.bottom - rect.top + 4}px`
      : `left: ${left}px; top: ${rect.bottom - box.top + 4}px`;
    const prev = menu;
    const keep = prev?.kind === kind && prev.query === props.query;
    menu = {
      kind,
      query: props.query,
      entries: props.items,
      loading: searching,
      command: props.command,
      style,
      active: keep && prev ? Math.min(prev.active, Math.max(0, props.items.length - 1)) : 0,
    };
  }

  function menuKeyDown({ event }: SuggestionKeyDownProps): boolean {
    const current = menu;
    if (!current || current.entries.length === 0) return false;
    const count = current.entries.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      menu = { ...current, active: (current.active + delta + count) % count };
      return true;
    }
    if ((event.key === 'Enter' && !event.metaKey && !event.ctrlKey) || event.key === 'Tab') {
      current.command(current.entries[current.active]);
      return true;
    }
    return false;
  }

  let emitted: string | null = null;
  let loadedInto: TiptapEditor | null = null;

  // Create / rebuild the editor. Only the schema-level inputs below are
  // tracked; everything else is read untracked (React fixed editorProps at
  // creation too: useEditor with deps never re-applied them).
  $effect(() => {
    const element = host;
    if (!element) return;
    const tiptapExtensions = createExtensions(bridge, {
      ticketKey: ticketKey ?? null,
      history,
      // Collaborative docs sync remote steps that must never be filtered out.
      maxLength: controlled ? maxLength : undefined,
      extra: extensions,
    });
    const instance = untrack(
      () =>
        new TiptapEditor({
          element,
          extensions: tiptapExtensions,
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
            emitted = markdown;
            onChange(markdown);
          },
        }),
    );
    editor = instance;
    return () => {
      instance.destroy();
      if (editor === instance) editor = null;
      if (untrack(() => menu) !== null) menu = null;
    };
  });

  // Controlled: (re)load the doc whenever `value` isn't what we last emitted.
  $effect(() => {
    const current = editor;
    const next = value;
    if (!current || !controlled) return;
    const focusFirst = autoFocus;
    untrack(() => {
      if (loadedInto === current && next === emitted) return;
      const first = loadedInto !== current;
      loadedInto = current;
      emitted = next;
      if (!loadMarkdown(current, next)) {
        onLossy();
        return;
      }
      if (first && focusFirst) current.commands.focus('end');
    });
  });

  $effect(() => {
    const current = editor;
    if (current && !controlled && autoFocus) untrack(() => current.commands.focus('end'));
  });

  $effect(() => {
    const current = editor;
    const editable = !disabled;
    untrack(() => current?.setEditable(editable, false));
  });

  $effect(() => {
    const notify = onEditor;
    if (!notify) return;
    const current = editor;
    untrack(() => notify(current));
    return () => untrack(() => notify(null));
  });

  // Combobox semantics for screen readers while a suggestion list is open.
  const activeOption = $derived(menu && menu.entries.length > 0 ? `${menuId}-${menu.active}` : null);
  $effect(() => {
    const dom = editor?.view.dom;
    if (!dom) return;
    if (activeOption) {
      dom.setAttribute('aria-controls', menuId);
      dom.setAttribute('aria-activedescendant', activeOption);
    } else {
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
    }
  });

  export function focus() {
    editor?.commands.focus();
  }

  export function pickImage() {
    fileInput?.click();
  }

  export function getEditor(): TiptapEditor | null {
    return editor;
  }
</script>

<div bind:this={wrapper} class="relative">
  <div bind:this={host}></div>
  {#if !editor}
    <div aria-hidden="true" class={cn('min-h-16', className)}></div>
  {/if}
  {#if menu}
    {@const current = menu}
    <SuggestionMenu
      id={menuId}
      entries={current.entries}
      active={current.active}
      loading={current.loading}
      style={current.style}
      onPick={(entry) => current.command(entry)}
      onHover={(index) => {
        if (menu && menu.active !== index) menu = { ...menu, active: index };
      }}
    />
  {/if}
  <input
    bind:this={fileInput}
    type="file"
    accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
    multiple
    hidden
    tabindex={-1}
    onchange={(e) => {
      const files = Array.from(e.currentTarget.files ?? []);
      e.currentTarget.value = '';
      if (editor && files.length > 0) uploadFilesAtCaret(editor, bridge.current, files);
    }}
  />
</div>
