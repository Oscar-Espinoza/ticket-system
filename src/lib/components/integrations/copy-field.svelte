<!--
  Read-only value + Copy button (API keys, webhook secrets, intake links and
  embed snippets). Falls back to selecting the text when the clipboard API is
  unavailable (insecure origins, some embedded browsers).
-->
<script lang="ts">
  import CopyIcon from '@lucide/svelte/icons/copy';
  import { toast } from 'svelte-sonner';

  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Textarea } from '@/lib/components/ui/textarea';
  import { cn } from '@/lib/utils';

  let {
    id,
    value,
    label = 'Text',
    multiline = false,
    class: className,
  }: {
    id?: string;
    value: string;
    /** Toast noun, e.g. "Link" → "Link copied". */
    label?: string;
    multiline?: boolean;
    class?: string;
  } = $props();

  let input = $state<HTMLInputElement | null>(null);
  let textarea = $state<HTMLTextAreaElement | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      (multiline ? textarea : input)?.select();
      toast.error('Copy failed — the text is selected, copy it manually');
    }
  }

  const select = (e: FocusEvent) => (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).select();
</script>

<div class={cn('flex items-start gap-2', className)}>
  {#if multiline}
    <Textarea
      rows={3}
      {id}
      bind:ref={textarea}
      {value}
      readonly
      spellcheck={false}
      onfocus={select}
      class="font-mono text-xs"
    />
  {:else}
    <Input {id} bind:ref={input} {value} readonly spellcheck={false} onfocus={select} class="font-mono text-xs" />
  {/if}
  <Button type="button" variant="outline" size="icon" onclick={copy} aria-label="Copy {label.toLowerCase()}">
    <CopyIcon />
  </Button>
</div>
