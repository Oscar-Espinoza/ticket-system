<script lang="ts">
  // User-written Markdown, rendered as a tree of elements (never {@html}):
  // raw HTML is dropped by the parser and again by rehypeSafe, links keep
  // http(s)/mailto only and open through the host, images become their alt text.
  import Markdown, { type Plugin } from 'svelte-exmarkdown';

  import { host } from './lib/app.svelte';
  import { remarkGfmLite } from './lib/gfm-lite';
  import { rehypeSafe, safeHref } from './lib/markdown';

  let { source }: { source: string } = $props();

  const plugins: Plugin[] = [{ remarkPlugin: remarkGfmLite }, { rehypePlugin: rehypeSafe }];

  function open(event: Event, href: string) {
    event.preventDefault();
    void host.openLink(href);
  }
</script>

<div class="prose-view">
  <Markdown md={source} {plugins}>
    {#snippet a({ href, children })}
      {@const safe = safeHref(href)}
      {#if safe}
        <a href={safe} onclick={(e) => open(e, safe)} rel="noreferrer noopener" target="_blank">{@render children?.()}</a>
      {:else}
        <span>{@render children?.()}</span>
      {/if}
    {/snippet}
    {#snippet img({ alt })}
      <span class="text-fg2">{alt ? `[image: ${alt}]` : '[image]'}</span>
    {/snippet}
    {#snippet input({ type, checked })}
      {#if type === 'checkbox'}
        <input type="checkbox" checked={!!checked} disabled aria-label={checked ? 'Done' : 'Not done'} />
      {/if}
    {/snippet}
  </Markdown>
</div>
