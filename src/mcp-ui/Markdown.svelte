<script lang="ts">
  // User-written Markdown, rendered as a tree of elements (never {@html}):
  // raw HTML shows as literal text (remarkLiteralHtml) and any that survives
  // is dropped by rehypeSafe, links keep http(s) only and open through the
  // host, images become their alt text.
  import Markdown, { type Plugin } from 'svelte-exmarkdown';

  import { host } from './lib/app.svelte';
  import { remarkGfmLite } from './lib/gfm-lite';
  import { rehypeSafe, remarkLiteralHtml, safeHref } from './lib/markdown';

  let { source }: { source: string } = $props();

  const plugins: Plugin[] = [{ remarkPlugin: remarkGfmLite }, { remarkPlugin: remarkLiteralHtml }, { rehypePlugin: rehypeSafe }];
</script>

<div class="prose-view">
  <Markdown md={source} {plugins}>
    {#snippet a({ href, children })}
      {@const safe = safeHref(href)}
      {#if safe}
        <!-- A button, not an anchor: with no href there is no middle-click, context-menu "open in new tab" or drag
             that could navigate around the host; every way of opening goes through ui/open-link. -->
        <button type="button" class="link-text" title={safe} onclick={() => void host.openLink(safe)}>{@render children?.()}</button>
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
