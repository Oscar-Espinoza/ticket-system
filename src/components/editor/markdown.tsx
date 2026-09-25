'use client';

// Safe markdown renderer shared by descriptions, comments, epic updates and the
// inbox. No raw HTML (skipHtml), URLs pass react-markdown's default protocol
// filter, external links open in a new tab without referrer / opener.
// Mentions (`@[Name](user:ID)`) render as chips; the current project's issue
// keys (`APP-12`) link to their permalink. A top-level paragraph holding only
// an allowlisted link (Figma, YouTube, Loom, Google Docs, Miro) renders as an
// embed — the same rule the editor uses.

import { memo, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown, { defaultUrlTransform, type Components, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ListItem, Parent, PhrasingContent, Root, RootContent } from 'mdast';

import { useOptionalProjectData } from '@/components/project/project-data';
import { issuePath } from '@/lib/issue-links';
import { cn } from '@/lib/utils';
import { EmbedFrame } from './embed-frame';
import { embedFor } from './embeds';
import { toggleTaskAt } from './text-edits';

const MENTION_PROTOCOL = 'user:';

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
function remarkMentions() {
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
function remarkIssueKeys(options: { ticketKey: string; projectId: string }) {
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
function remarkTaskOffsets() {
  return (tree: Root) =>
    walk(tree, (parent, index) => {
      const child = parent.children[index] as ListItem;
      if (child.type !== 'listItem' || typeof child.checked !== 'boolean') return;
      const offset = child.position?.start.offset;
      if (offset === undefined) return;
      child.data = { ...child.data, hProperties: { ...child.data?.hProperties, dataTaskOffset: offset } };
    });
}

/** Top-level paragraphs that are just an autolinked embeddable URL → embed placeholder. */
function remarkEmbeds() {
  return (tree: Root) => {
    for (const node of tree.children) {
      if (node.type !== 'paragraph' || node.children.length !== 1) continue;
      const [link] = node.children;
      if (link.type !== 'link' || link.children.length !== 1) continue;
      const [text] = link.children;
      if (text.type !== 'text' || text.value !== link.url || !embedFor(link.url)) continue;
      node.data = { ...node.data, hName: 'div', hProperties: { dataEmbed: link.url } };
    }
  };
}

function urlTransform(url: string) {
  return url.startsWith(MENTION_PROTOCOL) ? url : defaultUrlTransform(url);
}

function isInternal(href: string) {
  return (href.startsWith('/') && !href.startsWith('//')) || href.startsWith('#');
}

export function MentionChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-sm bg-primary/10 px-1 py-px font-medium text-primary">@{children}</span>
  );
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

const PROSE = cn(
  PROSE_BASE,
  '[&_li>p]:inline [&_.contains-task-list]:list-none [&_.contains-task-list]:pl-1',
);

export interface MarkdownProps {
  children: string;
  /** Link this project's issue keys (defaults to the current project route). */
  projectId?: string;
  ticketKey?: string;
  /** Makes task checkboxes interactive; receives the updated source. */
  onToggleTask?: (nextSource: string) => void;
  /** Render lone Figma / YouTube / … links as embeds (default true; off for compact previews). */
  embeds?: boolean;
  className?: string;
}

export const Markdown = memo(function Markdown({
  children,
  projectId,
  ticketKey,
  onToggleTask,
  embeds = true,
  className,
}: MarkdownProps) {
  const projectData = useOptionalProjectData();
  const keyProject = projectId ?? projectData?.project.id;
  const key = ticketKey ?? projectData?.project.ticketKey;

  const remarkPlugins = useMemo<NonNullable<Options['remarkPlugins']>>(() => {
    const plugins: NonNullable<Options['remarkPlugins']> = [
      remarkGfm,
      remarkMentions,
      remarkTaskOffsets,
    ];
    if (embeds) plugins.push(remarkEmbeds);
    // Keys are validated as uppercase letters on save; the guard keeps the RegExp safe regardless.
    if (keyProject && key && /^[A-Z][A-Z0-9]*$/.test(key)) {
      plugins.push([remarkIssueKeys, { ticketKey: key, projectId: keyProject }]);
    }
    return plugins;
  }, [keyProject, key, embeds]);

  const components = useMemo<Components>(
    () => ({
      a: ({ href, children: label }) => {
        if (href?.startsWith(MENTION_PROTOCOL)) return <MentionChip>{label}</MentionChip>;
        if (!href) return <span>{label}</span>;
        if (isInternal(href)) return <Link href={href}>{label}</Link>;
        return (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {label}
          </a>
        );
      },
      input: ({ type, checked }) => {
        if (type !== 'checkbox') return null;
        return (
          <input
            type="checkbox"
            checked={!!checked}
            disabled={!onToggleTask}
            aria-label={checked ? 'Completed task' : 'Open task'}
            className="mr-1.5 size-3.5 translate-y-0.5 accent-primary disabled:opacity-100"
            onChange={(e) => {
              const item = e.currentTarget.closest<HTMLElement>('li[data-task-offset]');
              const offset = Number(item?.dataset.taskOffset);
              if (!onToggleTask || !Number.isInteger(offset)) return;
              const next = toggleTaskAt(children, offset, e.currentTarget.checked);
              if (next !== null) onToggleTask(next);
            }}
          />
        );
      },
      div: ({ node, ...props }) => {
        const url = node?.properties?.dataEmbed;
        const embed = typeof url === 'string' ? embedFor(url) : null;
        if (embed && typeof url === 'string') return <EmbedFrame embed={embed} url={url} />;
        return <div {...props} />;
      },
      img: ({ src, alt }) =>
        // User-supplied external images; next/image would need every host allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        typeof src === 'string' ? <img src={src} alt={alt ?? ''} loading="lazy" /> : null,
    }),
    [children, onToggleTask],
  );

  return (
    <div className={cn(PROSE, className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={components}
        urlTransform={urlTransform}
        skipHtml
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
