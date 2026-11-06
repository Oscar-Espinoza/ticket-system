<!--
  Safe markdown renderer shared by descriptions, comments, epic updates and the
  inbox. No raw HTML (skipHtml), URLs pass react-markdown's
  default protocol filter, external links open in a new tab without referrer /
  opener. Mentions (`@[Name](user:ID)`) render as chips; the current project's
  issue keys (`APP-12`) link to their permalink. A top-level paragraph holding
  only an allowlisted link (Figma, YouTube, Loom, Google Docs, Miro) renders as
  an embed — the same rule the editor uses.

  `<Markdown source={text} />` (a Svelte child block is a snippet, not a string).
-->
<script module lang="ts">
  export interface MarkdownProps {
    /** The markdown source. */
    source: string;
    /** Link this project's issue keys (defaults to the current project route). */
    projectId?: string;
    ticketKey?: string;
    /** Makes task checkboxes interactive; receives the updated source. */
    onToggleTask?: (nextSource: string) => void;
    /** Render lone Figma / YouTube / … links as embeds (default true; off for compact previews). */
    embeds?: boolean;
    class?: string;
  }
</script>

<script lang="ts">
  import Markdown, { type Plugin } from 'svelte-exmarkdown';
  import { gfmPlugin } from 'svelte-exmarkdown/gfm';

  import { useOptionalProjectData } from '@/lib/components/project/project-data.svelte';
  import { cn } from '@/lib/utils';
  import { embedFor } from '@/lib/components/editor/embeds';
  import { toggleTaskAt } from '@/lib/components/editor/text-edits';
  import EmbedFrame from './embed-frame.svelte';
  import MentionChip from './mention-chip.svelte';
  import {
    MENTION_PROTOCOL,
    PROSE,
    isInternal,
    rehypeSafe,
    remarkEmbeds,
    remarkIssueKeys,
    remarkMentions,
    remarkTaskOffsets,
  } from './markdown-plugins';

  let { source, projectId, ticketKey, onToggleTask, embeds = true, class: className }: MarkdownProps = $props();

  const projectData = useOptionalProjectData();
  const keyProject = $derived(projectId ?? projectData?.project.id);
  const key = $derived(ticketKey ?? projectData?.project.ticketKey);

  const plugins = $derived.by<Plugin[]>(() => {
    const list: Plugin[] = [
      gfmPlugin(),
      { remarkPlugin: remarkMentions },
      { remarkPlugin: remarkTaskOffsets },
    ];
    if (embeds) list.push({ remarkPlugin: remarkEmbeds });
    // Keys are validated as uppercase letters on save; the guard keeps the RegExp safe regardless.
    if (keyProject && key && /^[A-Z][A-Z0-9]*$/.test(key)) {
      list.push({ remarkPlugin: [remarkIssueKeys, { ticketKey: key, projectId: keyProject }] });
    }
    // Last: react-markdown's skipHtml + urlTransform.
    list.push({ rehypePlugin: rehypeSafe });
    return list;
  });

  function onTaskChange(e: Event & { currentTarget: HTMLInputElement }) {
    const wanted = e.currentTarget.checked;
    // Controlled `checked`: the box shows the source's state and
    // flips only when the new source comes back (re-rendered from the AST).
    e.currentTarget.checked = !wanted;
    const item = e.currentTarget.closest<HTMLElement>('li[data-task-offset]');
    const offset = Number(item?.dataset.taskOffset);
    if (!onToggleTask || !Number.isInteger(offset)) return;
    const next = toggleTaskAt(source, offset, wanted);
    if (next !== null) onToggleTask(next);
  }
</script>

<div class={cn(PROSE, className)}>
  <Markdown md={source} {plugins}>
    {#snippet a({ href, children })}
      {#if href?.startsWith(MENTION_PROTOCOL)}
        <MentionChip>{@render children?.()}</MentionChip>
      {:else if !href}
        <span>{@render children?.()}</span>
      {:else if isInternal(href)}
        <a {href}>{@render children?.()}</a>
      {:else}
        <a {href} target="_blank" rel="noreferrer noopener">{@render children?.()}</a>
      {/if}
    {/snippet}
    {#snippet input({ type, checked })}
      {#if type === 'checkbox'}
        <input
          type="checkbox"
          checked={!!checked}
          disabled={!onToggleTask}
          aria-label={checked ? 'Completed task' : 'Open task'}
          class="mr-1.5 size-3.5 translate-y-0.5 accent-primary disabled:opacity-100"
          onchange={onTaskChange}
        />
      {/if}
    {/snippet}
    {#snippet div(props)}
      {@const url = props['data-embed']}
      {@const embed = typeof url === 'string' ? embedFor(url) : null}
      {#if embed && typeof url === 'string'}
        <EmbedFrame {embed} {url} />
      {:else}
        {@const { children, ...rest } = props}
        <div {...rest}>{@render children?.()}</div>
      {/if}
    {/snippet}
    {#snippet img({ src, alt })}
      <!-- User-supplied external images. -->
      {#if typeof src === 'string'}
        <img {src} alt={alt ?? ''} loading="lazy" />
      {/if}
    {/snippet}
  </Markdown>
</div>
