<!--
  Comment / reply / edit box (port of comment-composer.tsx). `onSubmit`
  resolves false on failure, which restores the text so nothing typed is lost.
-->
<script lang="ts">
  import { untrack } from 'svelte';

  import { MarkdownEditor } from '@/lib/components/editor';
  import { Button } from '@/lib/components/ui/button';
  import { COMMENT_MAX_LENGTH } from '@/lib/timeline';

  let {
    initialValue = '',
    placeholder = 'Leave a comment…',
    submitLabel = 'Comment',
    autoFocus,
    onSubmit,
    onCancel,
  }: {
    initialValue?: string;
    placeholder?: string;
    submitLabel?: string;
    autoFocus?: boolean;
    onSubmit: (body: string) => Promise<boolean> | boolean;
    onCancel?: () => void;
  } = $props();

  // useState(initialValue): the first value only.
  let draft = $state(untrack(() => initialValue));
  let pending = $state(false);
  const empty = $derived(!draft.trim());

  async function submit() {
    const body = draft.trim();
    if (!body || pending) return;
    pending = true;
    draft = '';
    const ok = await onSubmit(body);
    pending = false;
    if (!ok) draft = body;
  }
</script>

<MarkdownEditor
  aria-label={placeholder.replace(/…$/, '')}
  value={draft}
  onChange={(next) => (draft = next)}
  onSubmit={submit}
  {onCancel}
  {placeholder}
  {autoFocus}
  maxLength={COMMENT_MAX_LENGTH}
  textareaClassName="min-h-12"
>
  {#snippet actions()}
    {#if onCancel}
      <Button type="button" size="xs" variant="ghost" onclick={onCancel}>Cancel</Button>
    {/if}
    <Button type="button" size="xs" disabled={empty || pending} title="Submit (⌘Enter)" onclick={submit}>
      {submitLabel}
    </Button>
  {/snippet}
</MarkdownEditor>
