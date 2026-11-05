<!-- Customer notes: markdown, edited in place (CustomerNotes in customer-detail.tsx). -->
<script lang="ts">
  import PencilIcon from '@lucide/svelte/icons/pencil';

  import { CUSTOMER_NOTES_MAX } from '@/lib/components/customers/customer-model';
  import Markdown from '@/lib/components/editor/markdown.svelte';
  import MarkdownEditor from '@/lib/components/editor/markdown-editor.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { cn } from '@/lib/utils';

  let {
    notes,
    canWrite,
    onSave,
  }: {
    notes: string | null;
    canWrite: boolean;
    onSave: (notes: string | null) => void;
  } = $props();

  let editing = $state(false);
  let draft = $state('');

  function start() {
    draft = notes ?? '';
    editing = true;
  }

  function commit() {
    editing = false;
    const next = draft.trim() ? draft : null;
    if (next !== notes) onSave(next);
  }
</script>

{#if editing}
  <div class="flex flex-col gap-2">
    <MarkdownEditor
      autoFocus
      aria-label="Notes"
      value={draft}
      onChange={(value) => (draft = value)}
      onSubmit={commit}
      onCancel={() => (editing = false)}
      placeholder="Context, contacts, contract details… Markdown supported."
      maxLength={CUSTOMER_NOTES_MAX}
    />
    <div class="flex items-center justify-end gap-2">
      <span class="mr-auto text-xs text-muted-foreground">⌘Enter to save · Esc to cancel</span>
      <Button size="sm" variant="outline" onclick={() => (editing = false)}>Cancel</Button>
      <Button size="sm" onclick={commit}>Save</Button>
    </div>
  </div>
{:else}
  <section aria-label="Notes" class="group relative">
    {#if notes}
      <Markdown source={notes} />
    {:else}
      <p class="text-sm text-muted-foreground">{canWrite ? 'Add notes…' : 'No notes.'}</p>
    {/if}
    {#if canWrite}
      <Button
        variant="ghost"
        size="xs"
        class={cn(
          'mt-2',
          notes && 'absolute -top-1 right-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
        onclick={start}
      >
        <PencilIcon />
        {notes ? 'Edit' : 'Write notes'}
      </Button>
    {/if}
  </section>
{/if}
