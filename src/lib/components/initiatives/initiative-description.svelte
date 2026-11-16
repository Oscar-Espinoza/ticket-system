<!-- Initiative description: markdown view + editor. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import RichText from '@/lib/components/epics/rich-text.svelte';
  import RichTextEditor from '@/lib/components/epics/rich-text-editor.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { INITIATIVE_DESCRIPTION_MAX } from '@/lib/initiative-model';

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
      aria-label={m.common_description()}
      value={draft}
      onChange={(next) => (draft = next)}
      onSubmit={commit}
      onCancel={() => (editing = false)}
      maxLength={INITIATIVE_DESCRIPTION_MAX}
    />
    <div class="flex items-center justify-end gap-2">
      <Button size="sm" variant="outline" onclick={() => (editing = false)}>{m.common_cancel()}</Button>
      <Button size="sm" onclick={commit}>{m.common_save()}</Button>
    </div>
  </div>
{:else}
  <section aria-label={m.common_description()} class="flex flex-col items-start gap-2">
    {#if description}
      <RichText source={description} />
    {:else}
      <p class="text-sm text-muted-foreground">{m.projects_no_description()}</p>
    {/if}
    <Button
      variant="ghost"
      size="xs"
      onclick={() => {
        draft = description ?? '';
        editing = true;
      }}
    >
      {description ? m.projects_edit_description() : m.projects_write_description()}
    </Button>
  </section>
{/if}
