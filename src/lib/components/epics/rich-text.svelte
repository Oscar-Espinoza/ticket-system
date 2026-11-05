<!--
  Markdown for epic / initiative descriptions and epic updates — a thin adapter
  over the shared editor (B1): safe renderer (no raw HTML) + the markdown
  editor with toolbar, preview, @mentions, ⌘Enter / Esc.
-->
<script lang="ts">
  import { Markdown } from '@/lib/components/editor';

  let { source, class: className }: { source: string; class?: string } = $props();
</script>

<Markdown {source} class={className} />
