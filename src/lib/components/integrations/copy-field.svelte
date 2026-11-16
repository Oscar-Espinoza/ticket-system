<!--
  Read-only value + Copy button (API keys, webhook secrets, intake links and
  embed snippets). Falls back to selecting the text when the clipboard API is
  unavailable (insecure origins, some embedded browsers).
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import { toast } from 'svelte-sonner';

  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Textarea } from '@/lib/components/ui/textarea';
  import { cn } from '@/lib/utils';

  let {
    id,
    value,
    label = m.settings_int_copy_default_label(),
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
      toast.success(m.settings_int_copied_toast({ label }));
    } catch {
      (multiline ? textarea : input)?.select();
      toast.error(m.settings_int_copy_failed_toast());
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
  <Button type="button" variant="outline" size="icon" onclick={copy} aria-label={m.settings_int_copy_aria({ label: label.toLowerCase() })}>
    <CopyIcon />
  </Button>
</div>
