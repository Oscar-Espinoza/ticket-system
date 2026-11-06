// Non-component parts of the markdown renderer, for the
// svelte-exmarkdown renderer (markdown.svelte): the four mdast plugins
// (unchanged except hProperties keys, which svelte-exmarkdown spreads as-is so
// they are written kebab-case), the shared typography classes, and
// `rehypeSafe`, which restores react-markdown's `skipHtml` + `urlTransform`
// (defaultUrlTransform, with the `user:` mention protocol let through).

import type { ListItem, Parent, PhrasingContent, Root, RootContent } from 'mdast';

import { embedFor } from '@/lib/components/editor/embeds';
import { issuePath } from '@/lib/issue-links';
import { cn } from '@/lib/utils';

export const MENTION_PROTOCOL = 'user:';

// mdast-util-to-hast's `data` fields.
type HastData = { hName?: string; hProperties?: Record<string, unknown> };

function walk(node: Parent, visit: (parent: Parent, index: number) => number | void) {
  for (let i = 0; i < node.children.length; i++) {
    const skip = visit(node, i);
    if (typeof skip === 'number') {
      i = skip;
      continue;
    }
    const child = node.children[i];
    if ('children' in child) walk(child, visit);
  }
}

/** Drop the `@` before mention links — the chip renders its own. */
export function remarkMentions() {
  return (tree: Root) =>
    walk(tree, (parent, index) => {
      const child = parent.children[index];
      if (child.type !== 'link' || !child.url.startsWith(MENTION_PROTOCOL)) return;
      const prev = parent.children[index - 1];
      if (prev?.type === 'text' && prev.value.endsWith('@')) {
        prev.value = prev.value.slice(0, -1);
      }
      return index;
    });
}

/** Link bare `KEY-123` references (outside code and existing links). */
export function remarkIssueKeys(options: { ticketKey: string; projectId: string }) {
  const pattern = new RegExp(`\\b${options.ticketKey}-\\d+\\b`, 'g');
  return (tree: Root) =>
    walk(tree, (parent, index) => {
      const child = parent.children[index];
      if (child.type === 'link' || child.type === 'linkReference') return index;
      if (child.type !== 'text') return;
      const parts: PhrasingContent[] = [];
      let last = 0;
      for (const match of child.value.matchAll(pattern)) {
        const at = match.index ?? 0;
        if (at > last) parts.push({ type: 'text', value: child.value.slice(last, at) });
        parts.push({
          type: 'link',
          url: issuePath(options.projectId, match[0]),
          children: [{ type: 'text', value: match[0] }],
        });
        last = at + match[0].length;
      }
      if (parts.length === 0) return;
      if (last < child.value.length) parts.push({ type: 'text', value: child.value.slice(last) });
      parent.children.splice(index, 1, ...(parts as RootContent[]));
      return index + parts.length - 1;
    });
}

/** Tag task items with their source offset so a checkbox can flip its `[ ]`. */
export function remarkTaskOffsets() {
  return (tree: Root) =>
    walk(tree, (parent, index) => {
      const child = parent.children[index] as ListItem;
      if (child.type !== 'listItem' || typeof child.checked !== 'boolean') return;
      const offset = child.position?.start.offset;
      if (offset === undefined) return;
      const data = child.data as HastData | undefined;
      child.data = { ...data, hProperties: { ...data?.hProperties, 'data-task-offset': offset } } as ListItem['data'];
    });
}

/** Top-level paragraphs that are just an autolinked embeddable URL → embed placeholder. */
export function remarkEmbeds() {
  return (tree: Root) => {
    for (const node of tree.children) {
      if (node.type !== 'paragraph' || node.children.length !== 1) continue;
      const [link] = node.children;
      if (link.type !== 'link' || link.children.length !== 1) continue;
      const [text] = link.children;
      if (text.type !== 'text' || text.value !== link.url || !embedFor(link.url)) continue;
      node.data = { ...node.data, hName: 'div', hProperties: { 'data-embed': link.url } } as HastData;
    }
  };
}

// react-markdown's defaultUrlTransform: relative URLs and these protocols only.
const SAFE_PROTOCOL = /^(https?|ircs?|mailto|xmpp)$/i;

export function safeUrl(value: string): string {
  if (value.startsWith(MENTION_PROTOCOL)) return value;
  const colon = value.indexOf(':');
  const question = value.indexOf('?');
  const hash = value.indexOf('#');
  const slash = value.indexOf('/');
  if (
    colon === -1 ||
    (slash !== -1 && colon > slash) ||
    (question !== -1 && colon > question) ||
    (hash !== -1 && colon > hash) ||
    SAFE_PROTOCOL.test(value.slice(0, colon))
  ) {
    return value;
  }
  return '';
}

// The hast URL properties react-markdown's urlTransform covered
// (html-url-attributes: property → the tags it applies to, null = any tag).
const URL_ATTRIBUTES: Record<string, string[] | null> = {
  action: ['form'],
  cite: ['blockquote', 'del', 'ins', 'q'],
  data: ['object'],
  formAction: ['button', 'input'],
  href: ['a', 'area', 'base', 'link'],
  icon: ['menuitem'],
  itemId: null,
  manifest: ['html'],
  ping: ['a', 'area'],
  poster: ['video'],
  src: ['audio', 'embed', 'iframe', 'img', 'input', 'script', 'source', 'track', 'video'],
};

interface HastLike {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastLike[];
}

/** Last rehype plugin: drop raw HTML (`skipHtml`) and unsafe URLs (`urlTransform`). */
export function rehypeSafe() {
  return (tree: HastLike) => {
    const visit = (node: HastLike) => {
      if (!node.children) return;
      node.children = node.children.filter((child) => child.type !== 'raw');
      for (const child of node.children) {
        if (child.type !== 'element') continue;
        const props = child.properties;
        if (props) {
          for (const [key, tags] of Object.entries(URL_ATTRIBUTES)) {
            if (!Object.hasOwn(props, key)) continue;
            if (tags !== null && !tags.includes(child.tagName ?? '')) continue;
            props[key] = safeUrl(String(props[key] || ''));
          }
        }
        visit(child);
      }
    };
    visit(tree);
  };
}

export function isInternal(href: string) {
  return (href.startsWith('/') && !href.startsWith('//')) || href.startsWith('#');
}

/** Typography shared by the renderer and the rich editor. */
export const PROSE_BASE = cn(
  'min-w-0 text-sm leading-relaxed break-words',
  '[&>*+*]:mt-2.5 [&_li+li]:mt-1',
  '[&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-medium [&_h5]:font-medium [&_h6]:font-medium',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em]',
  '[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs',
  '[&_a]:text-primary [&_a]:underline-offset-2 [&_a:hover]:underline',
  '[&_hr]:border-border [&_img]:max-h-96 [&_img]:max-w-full [&_img]:rounded-md',
  '[&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium',
);

export const PROSE = cn(
  PROSE_BASE,
  '[&_li>p]:inline [&_.contains-task-list]:list-none [&_.contains-task-list]:pl-1',
);
