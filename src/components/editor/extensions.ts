// Tiptap setup for the rich editor. Everything dynamic (members, issues,
// upload target, callbacks, the suggestion menu) is read through `runtime`, a
// ref the React component keeps current, so the extensions are built once per
// editor instead of on every render.

import { Extension, Node, ReactNodeViewRenderer, type AnyExtension, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Mention, { type MentionOptions } from '@tiptap/extension-mention';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Placeholder } from '@tiptap/extensions';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { SuggestionKeyDownProps, SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  AtSign,
  Hash,
} from 'lucide-react';

import { formatMention } from '@/lib/mentions';
import type { IssueUser } from '@/lib/issue-model';
import type { EditorIssue } from './context';
import { EmbedNodeView } from './embed-node-view';
import { embedFor } from './embeds';
import type { SlashCommand, SuggestionEntry } from './suggestion-menu';
import type { ImageUploadResult } from './upload';

export type MenuKind = SuggestionEntry['type'];

export interface EditorRuntime {
  members: () => readonly IssueUser[];
  searchIssues: (query: string, signal: AbortSignal) => EditorIssue[] | Promise<EditorIssue[]>;
  /** Null when there's nowhere to put images. */
  upload: ((file: File) => Promise<ImageUploadResult>) | null;
  pickImage: () => void;
  notify: (error: string) => void;
  placeholder: () => string;
  submit: () => void;
  /** False when the host has no cancel action (Esc then does nothing special). */
  cancel: () => boolean;
  openLink: () => void;
  menu: {
    show: (kind: MenuKind, props: SuggestionProps<SuggestionEntry, SuggestionEntry>) => void;
    hide: (kind: MenuKind) => void;
    keyDown: (props: SuggestionKeyDownProps) => boolean;
  };
}

type RuntimeRef = { readonly current: EditorRuntime };

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

interface SlashAction extends SlashCommand {
  run: (editor: Editor, runtime: EditorRuntime) => void;
  needsUpload?: boolean;
}

const SLASH: SlashAction[] = [
  { id: 'h1', label: 'Heading 1', keywords: 'title h1', icon: Heading1, hint: '#', run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { id: 'h2', label: 'Heading 2', keywords: 'subtitle h2', icon: Heading2, hint: '##', run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { id: 'h3', label: 'Heading 3', keywords: 'h3', icon: Heading3, hint: '###', run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { id: 'bullet', label: 'Bulleted list', keywords: 'unordered ul', icon: List, hint: '-', run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: 'numbered', label: 'Numbered list', keywords: 'ordered ol', icon: ListOrdered, hint: '1.', run: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: 'task', label: 'Checklist', keywords: 'todo task checkbox', icon: ListTodo, hint: '[]', run: (e) => e.chain().focus().toggleTaskList().run() },
  { id: 'quote', label: 'Quote', keywords: 'blockquote', icon: Quote, hint: '>', run: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: 'code', label: 'Code block', keywords: 'snippet pre', icon: Code2, hint: '```', run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { id: 'divider', label: 'Divider', keywords: 'rule hr line separator', icon: Minus, hint: '---', run: (e) => e.chain().focus().setHorizontalRule().run() },
  { id: 'image', label: 'Image', keywords: 'picture photo upload screenshot', icon: ImageIcon, needsUpload: true, run: (_e, rt) => rt.pickImage() },
  { id: 'mention', label: 'Mention', keywords: 'person user teammate', icon: AtSign, hint: '@', run: (e) => e.chain().focus().insertContent('@').run() },
  { id: 'issue', label: 'Issue reference', keywords: 'link ticket', icon: Hash, hint: '#', run: (e) => e.chain().focus().insertContent('#').run() },
];

function slashItems(runtime: EditorRuntime, query: string): SuggestionEntry[] {
  const q = query.toLowerCase();
  return SLASH.filter((c) => (!c.needsUpload || runtime.upload) && `${c.label} ${c.keywords}`.toLowerCase().includes(q))
    .slice(0, 12)
    .map((command) => ({ type: 'command', command }));
}

// ---------------------------------------------------------------------------
// Suggestions (@ members, # / KEY- issues, / commands) on one Mention node
// ---------------------------------------------------------------------------

const MENTION_TOKEN = /^@\[([^\]\n]{1,80})\]\(user:([A-Za-z0-9_-]{1,64})\)/;

/**
 * Mention nodes stored as the app's canonical `@[Name](user:ID)` token instead
 * of Tiptap's `[@ id="…"]` shortcode, so markdown round-trips byte-exact.
 */
const AppMention = Mention.extend({
  markdownTokenName: 'appMention',
  markdownTokenizer: {
    name: 'appMention',
    level: 'inline',
    start: (src: string) => src.indexOf('@['),
    tokenize: (src: string) => {
      const match = MENTION_TOKEN.exec(src);
      if (!match) return undefined;
      return { type: 'appMention', raw: match[0], label: match[1], id: match[2] };
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode('mention', { id: token.id, label: token.label }),
  renderMarkdown: (node) => formatMention({ id: String(node.attrs?.id ?? ''), name: String(node.attrs?.label ?? '') }),
});

function suggestion(
  runtime: RuntimeRef,
  kind: MenuKind,
  options: Partial<SuggestionOptions<SuggestionEntry, SuggestionEntry>> & {
    char: string;
    insert: (editor: Editor, range: { from: number; to: number }, entry: SuggestionEntry) => void;
  },
): Omit<SuggestionOptions<SuggestionEntry, SuggestionEntry>, 'editor'> {
  const { insert, ...rest } = options;
  return {
    ...rest,
    command: ({ editor, range, props }) => insert(editor, range, props),
    render: () => ({
      onStart: (props) => runtime.current.menu.show(kind, props),
      onUpdate: (props) => runtime.current.menu.show(kind, props),
      onExit: () => runtime.current.menu.hide(kind),
      onKeyDown: (props) => runtime.current.menu.keyDown(props),
    }),
  };
}

function mentionSuggestions(runtime: RuntimeRef, ticketKey: string | null) {
  const insertIssue = (editor: Editor, range: { from: number; to: number }, entry: SuggestionEntry) => {
    if (entry.type !== 'issue') return;
    editor.chain().focus().insertContentAt(range, `${entry.issue.key} `).run();
  };
  const issueItems = async ({ query, signal }: { query: string; signal: AbortSignal }): Promise<SuggestionEntry[]> =>
    (await runtime.current.searchIssues(query, signal)).map((issue) => ({ type: 'issue', issue }));

  const list = [
    suggestion(runtime, 'member', {
      char: '@',
      allowedPrefixes: [' ', '('],
      items: ({ query }) =>
        runtime.current
          .members()
          .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 8)
          .map((member) => ({ type: 'member', member })),
      insert: (editor, range, entry) => {
        if (entry.type !== 'member') return;
        const label = entry.member.name.replace(/[[\]\n]/g, '').trim() || 'user';
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: 'mention', attrs: { id: entry.member.id, label } },
            { type: 'text', text: ' ' },
          ])
          .run();
      },
    }),
    suggestion(runtime, 'issue', {
      char: '#',
      debounce: 120,
      items: (props) => issueItems(props),
      insert: insertIssue,
    }),
    suggestion(runtime, 'command', {
      char: '/',
      items: ({ query }) => slashItems(runtime.current, query),
      insert: (editor, range, entry) => {
        if (entry.type !== 'command') return;
        editor.chain().focus().deleteRange(range).run();
        (entry.command as SlashAction).run(editor, runtime.current);
      },
    }),
  ];
  if (ticketKey) {
    list.push(
      suggestion(runtime, 'issue', {
        // Typing the project's own key ("APP-") suggests its issues too.
        char: `${ticketKey}-`,
        allowToIncludeChar: true,
        debounce: 120,
        items: (props) => issueItems(props),
        insert: insertIssue,
      }),
    );
  }
  return list;
}

// ---------------------------------------------------------------------------
// Embeds
// ---------------------------------------------------------------------------

/** A provider iframe for an allowlisted link; stored as the bare URL on its own line. */
export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  // Before Link's paste handler.
  priority: 1001,

  addAttributes() {
    return {
      url: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-embed'),
        renderHTML: (attributes) => ({ 'data-embed': attributes.url }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', HTMLAttributes];
  },

  renderText({ node }) {
    return String(node.attrs.url ?? '');
  },

  renderMarkdown: (node) => String(node.attrs?.url ?? ''),

  addNodeView() {
    return ReactNodeViewRenderer(EmbedNodeView);
  },

  addProseMirrorPlugins() {
    const type = this.type;
    return [
      new Plugin({
        key: new PluginKey('embedPaste'),
        props: {
          // An allowlisted link pasted on an empty top-level line becomes an embed.
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData('text/plain').trim() ?? '';
            if (!text || /\s/.test(text) || !embedFor(text)) return false;
            const { $from, empty } = view.state.selection;
            if (!empty || $from.depth !== 1 || $from.parent.type.name !== 'paragraph' || $from.parent.content.size > 0) {
              return false;
            }
            const paragraph = view.state.schema.nodes.paragraph.create();
            const tr = view.state.tr.replaceWith($from.before(), $from.after(), [type.create({ url: text }), paragraph]);
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// Image paste / drop with an in-place "Uploading…" placeholder
// ---------------------------------------------------------------------------

const uploadKey = new PluginKey<DecorationSet>('imageUpload');

type UploadMeta = { add: { id: object; pos: number } } | { remove: { id: object } };

function placeholderAt(state: EditorState, id: object): number | null {
  const found = uploadKey.getState(state)?.find(undefined, undefined, (spec) => spec.id === id);
  return found?.length ? found[0].from : null;
}

function uploadingWidget() {
  const el = document.createElement('span');
  el.className = 'inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground animate-pulse';
  el.textContent = 'Uploading image…';
  return el;
}

function startUploads(editor: Editor, runtime: EditorRuntime, files: File[], pos: number) {
  const upload = runtime.upload;
  if (!upload) return;
  for (const file of files) {
    const id = {};
    editor.view.dispatch(editor.state.tr.setMeta(uploadKey, { add: { id, pos } } satisfies UploadMeta));
    upload(file).then((result) => {
      if (editor.isDestroyed) return;
      const at = placeholderAt(editor.state, id);
      editor.view.dispatch(editor.state.tr.setMeta(uploadKey, { remove: { id } } satisfies UploadMeta));
      if (!result.ok) runtime.notify(result.error);
      else if (at !== null) {
        const alt = file.name.replace(/[[\]\n]/g, '').slice(0, 120);
        editor.chain().insertContentAt(at, { type: 'image', attrs: { src: result.url, alt } }).run();
      }
    });
  }
}

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith('image/'));
}

function imageUpload(runtime: RuntimeRef) {
  return Extension.create({
    name: 'imageUpload',

    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin<DecorationSet>({
          key: uploadKey,
          state: {
            init: () => DecorationSet.empty,
            apply(tr, set) {
              let next = set.map(tr.mapping, tr.doc);
              const meta = tr.getMeta(uploadKey) as UploadMeta | undefined;
              if (meta && 'add' in meta) {
                const widget = Decoration.widget(meta.add.pos, uploadingWidget, { id: meta.add.id });
                next = next.add(tr.doc, [widget]);
              } else if (meta && 'remove' in meta) {
                next = next.remove(next.find(undefined, undefined, (spec) => spec.id === meta.remove.id));
              }
              return next;
            },
          },
          props: {
            decorations: (state) => uploadKey.getState(state),
            handlePaste: (view, event) => {
              const files = imageFiles(event.clipboardData?.files);
              if (files.length === 0) return false;
              if (!runtime.current.upload) {
                runtime.current.notify("Images can't be added here.");
                return true;
              }
              startUploads(editor, runtime.current, files, view.state.selection.from);
              return true;
            },
            handleDrop: (view, event, _slice, moved) => {
              if (moved) return false;
              const files = imageFiles(event.dataTransfer?.files);
              if (files.length === 0) return false;
              event.preventDefault();
              if (!runtime.current.upload) {
                runtime.current.notify("Images can't be added here.");
                return true;
              }
              const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
              startUploads(editor, runtime.current, files, at?.pos ?? view.state.selection.from);
              return true;
            },
          },
        }),
      ];
    },
  });
}

/** Insert already-picked files at the caret (slash "Image"). */
export function uploadFilesAtCaret(editor: Editor, runtime: EditorRuntime, files: File[]) {
  startUploads(editor, runtime, files, editor.state.selection.from);
}

// ---------------------------------------------------------------------------
// Keys: after the suggestion plugins, so an open menu gets Enter / Esc first
// ---------------------------------------------------------------------------

function editorKeys(runtime: RuntimeRef) {
  return Extension.create({
    name: 'editorKeys',
    priority: 50,
    addKeyboardShortcuts() {
      return {
        'Mod-Enter': () => {
          runtime.current.submit();
          return true;
        },
        Escape: () => runtime.current.cancel(),
        'Mod-k': () => {
          runtime.current.openLink();
          return true;
        },
      };
    },
  });
}

/**
 * Blocks edits that would grow the text past `limit`. Unlike CharacterCount it
 * lets programmatic loads through (setContent without an update event), so an
 * over-long existing value still opens instead of silently showing empty.
 */
function lengthLimit(runtime: RuntimeRef, limit: number) {
  return Extension.create({
    name: 'lengthLimit',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('lengthLimit'),
          filterTransaction: (tr, state) => {
            if (!tr.docChanged || tr.getMeta('preventUpdate')) return true;
            const next = tr.doc.textContent.length;
            if (next <= limit || next <= state.doc.textContent.length) return true;
            if (tr.getMeta('paste') || tr.getMeta('uiEvent')) {
              runtime.current.notify(`That would go over the ${limit.toLocaleString()} character limit.`);
            }
            return false;
          },
        }),
      ];
    },
  });
}

// ---------------------------------------------------------------------------

export function createExtensions(
  runtime: RuntimeRef,
  options: { ticketKey: string | null; history: boolean; maxLength?: number; extra?: AnyExtension[] },
): AnyExtension[] {
  return [
    StarterKit.configure({
      underline: false,
      undoRedo: options.history ? {} : false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noreferrer noopener', target: '_blank' },
      },
    }),
    Markdown.configure({ markedOptions: { gfm: true } }),
    Placeholder.configure({ placeholder: () => runtime.current.placeholder() }),
    TaskList.configure({ HTMLAttributes: { class: 'task-list' } }),
    TaskItem.configure({ nested: true, HTMLAttributes: { class: 'task-item' } }),
    Image.configure({ inline: false, allowBase64: false }),
    AppMention.configure({
      HTMLAttributes: { class: 'rounded-sm bg-primary/10 px-1 py-px font-medium text-primary' },
      renderText: ({ node }) => `@${node.attrs.label ?? ''}`,
      renderHTML: ({ options: opts, node }) => ['span', opts.HTMLAttributes, `@${node.attrs.label ?? ''}`],
      // Our triggers select SuggestionEntry values, not mention attrs; each inserts its own content.
      suggestions: mentionSuggestions(runtime, options.ticketKey) as unknown as MentionOptions['suggestions'],
    }),
    Embed,
    imageUpload(runtime),
    editorKeys(runtime),
    ...(options.maxLength ? [lengthLimit(runtime, options.maxLength)] : []),
    ...(options.extra ?? []),
  ];
}
