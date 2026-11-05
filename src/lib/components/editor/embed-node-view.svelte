<!-- Tiptap node view for the `embed` node (port of embed-node-view.tsx). -->
<script lang="ts">
  import type { NodeViewProps } from '@tiptap/core';
  import { NodeViewWrapper } from 'svelte-tiptap';

  import { embedFor } from '@/lib/components/editor/embeds';
  import EmbedFrame from './embed-frame.svelte';

  let { node, selected }: NodeViewProps = $props();

  const url = $derived(String(node.attrs.url ?? ''));
  const embed = $derived(embedFor(url));
</script>

<NodeViewWrapper contenteditable="false" data-drag-handle class="my-2">
  {#if embed}
    <EmbedFrame {embed} {url} {selected} />
  {:else}
    <p class="text-sm text-muted-foreground">{url}</p>
  {/if}
</NodeViewWrapper>
