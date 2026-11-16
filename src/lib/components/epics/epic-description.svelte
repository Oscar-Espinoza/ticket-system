<!-- Epic description: markdown view + editor. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import PencilIcon from '@lucide/svelte/icons/pencil';

  import { Button } from '@/lib/components/ui/button';
  import { cn } from '@/lib/utils';
  import { EPIC_DESCRIPTION_MAX } from '@/lib/epic-model';
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
      aria-label={m.common_description()}
      value={draft}
      onChange={(next) => (draft = next)}
      onSubmit={commit}
      onCancel={() => (editing = false)}
      placeholder={m.projects_epic_describe_placeholder()}
      maxLength={EPIC_DESCRIPTION_MAX}
    />
    <div class="flex items-center justify-end gap-2">
      <span class="mr-auto text-xs text-muted-foreground">{m.projects_description_shortcuts()}</span>
      <Button size="sm" variant="outline" onclick={() => (editing = false)}>{m.common_cancel()}</Button>
      <Button size="sm" onclick={commit}>{m.common_save()}</Button>
    </div>
  </div>
{:else}
  <section aria-label={m.common_description()} class="group relative">
    {#if description}
      <RichText source={description} />
    {:else}
      <p class="text-sm text-muted-foreground">
        {canWrite ? m.projects_add_description() : m.projects_no_description()}
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
        {description ? m.common_edit() : m.projects_write_description()}
      </Button>
    {/if}
  </section>
{/if}
