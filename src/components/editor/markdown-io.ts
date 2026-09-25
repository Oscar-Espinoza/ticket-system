// Markdown ⇄ Tiptap JSON glue around @tiptap/markdown: structure fixes after
// parsing (top-level embeds, block images), readable output after serializing
// (Slack, email and the API read the raw text) and a fidelity check so content
// the rich editor can't represent opens in raw mode instead of losing text.

import type { JSONContent } from '@tiptap/react';

import { embedFor } from './embeds';

// ---------------------------------------------------------------------------
// After parsing
// ---------------------------------------------------------------------------

const LIST_ITEMS = new Set(['listItem', 'taskItem']);

/** A paragraph holding only an autolinked URL (text === href). */
function soleAutolink(node: JSONContent): string | null {
  if (node.type !== 'paragraph' || node.content?.length !== 1) return null;
  const [child] = node.content;
  const link = child.marks?.find((mark) => mark.type === 'link');
  if (child.type !== 'text' || !link || child.marks?.length !== 1) return null;
  const href = link.attrs?.href;
  return typeof href === 'string' && href === child.text ? href : null;
}

/** Images are block nodes here; lift any that markdown put inside a paragraph. */
function normalize(node: JSONContent, parentType: string | undefined): JSONContent[] {
  const children = node.content?.flatMap((child) => normalize(child, node.type));
  const next = children ? { ...node, content: children } : node;
  if (next.type !== 'paragraph' || !next.content?.some((c) => c.type === 'image')) return [next];

  const out: JSONContent[] = [];
  let run: JSONContent[] = [];
  const flush = () => {
    // Whitespace-only runs between images would become stray paragraphs.
    if (run.some((c) => c.type !== 'text' || c.text?.trim())) {
      const first = run[0];
      const last = run[run.length - 1];
      if (first.type === 'text') run[0] = { ...first, text: first.text?.trimStart() };
      if (last.type === 'text') run[run.length - 1] = { ...run[run.length - 1], text: run[run.length - 1].text?.trimEnd() };
      out.push({ type: 'paragraph', content: run.filter((c) => c.type !== 'text' || c.text) });
    }
    run = [];
  };
  for (const child of next.content) {
    if (child.type === 'image') {
      flush();
      out.push(child);
    } else {
      run.push(child);
    }
  }
  flush();
  // List items must start with a paragraph.
  if (parentType && LIST_ITEMS.has(parentType) && out[0]?.type !== 'paragraph') {
    out.unshift({ type: 'paragraph' });
  }
  return out;
}

/** Top-level lone embeddable links become embed blocks, the renderer's rule. */
export function normalizeParsed(doc: JSONContent): JSONContent {
  const content = (doc.content ?? []).flatMap((node) => {
    const url = soleAutolink(node);
    if (url && embedFor(url)) return [{ type: 'embed', attrs: { url } }];
    return normalize(node, doc.type);
  });
  return { ...doc, content };
}

// ---------------------------------------------------------------------------
// After serializing
// ---------------------------------------------------------------------------

const FENCE = /^[ \t]*(`{3,}|~{3,})/;

/** Apply `fn` to the markdown outside fenced code blocks and inline code spans. */
function outsideCode(markdown: string, fn: (text: string) => string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let prose: string[] = [];
  let fence: string | null = null;
  const flushProse = () => {
    if (prose.length === 0) return;
    const text = prose.join('\n');
    // Inline code spans: same-length backtick runs.
    out.push(text.split(/(`+[^`]*?`+)/).map((part, i) => (i % 2 ? part : fn(part))).join(''));
    prose = [];
  };
  for (const line of lines) {
    const match = FENCE.exec(line);
    if (fence) {
      out.push(line);
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length) fence = null;
    } else if (match) {
      flushProse();
      fence = match[1];
      out.push(line);
    } else {
      prose.push(line);
    }
  }
  flushProse();
  return out.join('\n');
}

const unescape = (text: string) =>
  text.replace(/\\([\\`*_[\]~])/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const BARE_URL = /^https?:\/\/[^\s<>()[\]`]+$/;
const URL_TAIL = /[.,:;!?'"*_~]$/;

function tidyProse(text: string): string {
  return (
    text
      // [https://x](https://x) → https://x (what people typed / pasted).
      .replace(/\[((?:\\.|[^\]\\])+)\]\(([^()\s]+)\)(.?)/g, (all, label: string, href: string, next: string) => {
        if (unescape(label) !== href || !/^(https?:|mailto:)/.test(href)) return all;
        const bare = BARE_URL.test(href) && !URL_TAIL.test(href) && !/[\p{L}\p{N}_/-]/u.test(next);
        return `${bare ? href : `<${href}>`}${next}`;
      })
      // Entities only where the bare character would be read as markup.
      .replace(/&amp;(?!#?[A-Za-z0-9]+;)/g, '&')
      .replace(/&lt;(?![A-Za-z/!?])/g, '<')
      .replace(/(?<=[^\s>])&gt;/g, '>')
      // `_` inside a word never starts emphasis.
      .replace(/(?<=[\p{L}\p{N}])\\_(?=[\p{L}\p{N}])/gu, '_')
      // Nor does a `*` / `_` with spaces on both sides (mid-line, so never a bullet).
      .replace(/(?<=\S[ \t]+)\\([*_])(?=[ \t])/g, '$1')
      // "[WIP]" can't become a link unless `(`, `[` or `:` follows; "[ ]" stays escaped (task syntax).
      .replace(/\\\[([^\]\\\n]*)\\\](?![([:])/g, (all, inner: string) => (/^[ xX]?$/.test(inner) ? all : `[${inner}]`))
      // Blank-line markers for consecutive empty paragraphs.
      .replace(/^&nbsp;$/gm, '')
  );
}

export function tidyMarkdown(markdown: string): string {
  return outsideCode(markdown, tidyProse)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Fidelity
// ---------------------------------------------------------------------------

/** Letters and digits only, entities dropped: what a reader would lose. */
function signature(markdown: string): string {
  return markdown
    .replace(/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** True when `after` (a parse → serialize round trip) kept all of `before`'s text. */
export function keepsText(before: string, after: string): boolean {
  return signature(before) === signature(after);
}
