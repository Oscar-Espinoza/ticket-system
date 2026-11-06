<!-- initiative-detail.tsx InitiativeDescription. -->
<script lang="ts">
  import RichText from '@/lib/components/epics/rich-text.svelte';
  import RichTextEditor from '@/lib/components/epics/rich-text-editor.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { EPIC_DESCRIPTION_MAX } from '@/lib/epic-model';

  let {
    description,
    onSave,
  }: {
    description: string | null;
    onSave: (description: string | null) => void;
  } = $props();

  let editing = $state(false);
  // svelte-ignore state_referenced_locally
  let draft = $state(description ?? '');
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
      maxLength={EPIC_DESCRIPTION_MAX}
    />
    <div class="flex items-center justify-end gap-2">
      <Button size="sm" variant="outline" onclick={() => (editing = false)}>Cancel</Button>
      <Button size="sm" onclick={commit}>Save</Button>
    </div>
  </div>
{:else}
  <section aria-label="Description" class="flex flex-col items-start gap-2">
    {#if description}
      <RichText source={description} />
    {:else}
      <p class="text-sm text-muted-foreground">No description.</p>
    {/if}
    <Button
      variant="ghost"
      size="xs"
      onclick={() => {
        draft = description ?? '';
        editing = true;
      }}
    >
      {description ? 'Edit description' : 'Write description'}
    </Button>
  </section>
{/if}
