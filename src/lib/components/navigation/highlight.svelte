<!--
  Renders text containing search highlight sentinels as text + <mark> nodes.
  Svelte escapes every segment, so issue content can never inject markup.
-->
<script module lang="ts">
  import { MARK_END, MARK_START } from '@/lib/search-marks';

  interface Part {
    text: string;
    marked?: string;
  }

  // "abc" → [{ text: "a" }, { marked: "b", text: "c" }]: each part
  // after the first starts marked.
  function split(text: string): Part[] {
    return text.split(MARK_START).map((part, index) => {
      if (index === 0) return { text: part.replaceAll(MARK_END, '') };
      const end = part.indexOf(MARK_END);
      const marked = end === -1 ? part : part.slice(0, end);
      const rest = end === -1 ? '' : part.slice(end + 1).replaceAll(MARK_END, '');
      return { marked, text: rest };
    });
  }
</script>

<script lang="ts">
  let { text }: { text: string } = $props();

  const parts = $derived(split(text));
</script>

{#each parts as part, index (index)}{#if part.marked !== undefined}<mark class="rounded-sm bg-yellow-200/70 px-px text-inherit dark:bg-yellow-500/30">{part.marked}</mark>{/if}{part.text}{/each}
