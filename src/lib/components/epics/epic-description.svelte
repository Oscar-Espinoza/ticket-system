<!-- Epic description: markdown view + editor (epic-detail.tsx EpicDescription). -->
<script lang="ts">
  import PencilIcon from '@lucide/svelte/icons/pencil';

  import { Button } from '@/lib/components/ui/button';
  import { cn } from '@/lib/utils';
  import { EPIC_DESCRIPTION_MAX } from '@/lib/components/epics/epic-model';
  import RichText from './rich-text.svelte';
  import RichTextEditor from './rich-text-editor.svelte';

  let {
    description,
    canWrite,
    onSave,
  }: {
    description: string | null;
    canWrite: boolean;
    onSave: (description: string | null) => void;
  } = $props();

  let editing = $state(false);
  // svelte-ignore state_referenced_locally
  let draft = $state(description ?? '');

  const start = () => {
    draft = description ?? '';
    editing = true;
  };
  const commit = () => {
    editing = false;
    const next = draft.trim() ? draft : null;
    if (next !== description) onSave(next);
  };
</script>

{#if editing}
  <div class="flex flex-col gap-2">
    <RichTextEditor
      autoFocus
      aria-label="Description"
      value={draft}
      onChange={(next) => (draft = next)}
      onSubmit={commit}
      onCancel={() => (editing = false)}
      placeholder="Describe the goal, scope and plan. Markdown supported."
      maxLength={EPIC_DESCRIPTION_MAX}
    />
    <div class="flex items-center justify-end gap-2">
      <span class="mr-auto text-xs text-muted-foreground">⌘Enter to save · Esc to cancel</span>
      <Button size="sm" variant="outline" onclick={() => (editing = false)}>Cancel</Button>
      <Button size="sm" onclick={commit}>Save</Button>
    </div>
  </div>
{:else}
  <section aria-label="Description" class="group relative">
    {#if description}
      <RichText source={description} />
    {:else}
      <p class="text-sm text-muted-foreground">
        {canWrite ? 'Add a description…' : 'No description.'}
      </p>
    {/if}
    {#if canWrite}
      <Button
        variant="ghost"
        size="xs"
        class={cn(
          'mt-2',
          description &&
            'absolute -top-1 right-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
        onclick={start}
      >
        <PencilIcon />
        {description ? 'Edit' : 'Write description'}
      </Button>
    {/if}
  </section>
{/if}
