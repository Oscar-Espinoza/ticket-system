<!-- <RichEditorProvider value={{ projectId, ticketId }}> — see context.svelte.ts for the API. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { setRichEditorContext, type RichEditorContextValue } from './context.svelte';

  let { value, children }: { value: RichEditorContextValue; children?: Snippet } = $props();

  setRichEditorContext(() => value);
</script>

{@render children?.()}
