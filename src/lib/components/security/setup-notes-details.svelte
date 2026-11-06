<!--
  Collapsible note block shared by SetupNotes and ScimNotes.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<details class="group rounded-md border border-border px-3 py-2 text-sm">
  <summary class="cursor-pointer text-muted-foreground select-none group-open:text-foreground">
    {title}
  </summary>
  <div
    class="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-foreground"
  >
    {@render children()}
  </div>
</details>
