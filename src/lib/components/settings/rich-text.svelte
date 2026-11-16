<!--
  Renders a translated message with light inline markup: **bold** and `code`.
  Keeps notes and hints to one message per sentence while still styling the
  literal bits (menu paths, field names, commands).
-->
<script lang="ts">
  let { text }: { text: string } = $props();

  const parts = $derived(text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean));
</script>

{#each parts as part, i (i)}{#if part.startsWith('**')}<b>{part.slice(2, -2)}</b>{:else if part.startsWith('`')}<code>{part.slice(1, -1)}</code>{:else}{part}{/if}{/each}
