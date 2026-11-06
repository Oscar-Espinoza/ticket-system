<!-- Editable epic title (epic-detail.tsx EpicName). -->
<script lang="ts">
  import { Textarea } from '@/lib/components/ui/textarea';
  import { EPIC_NAME_MAX } from '@/lib/epic-model';

  let {
    name,
    canWrite,
    onSave,
  }: {
    name: string;
    canWrite: boolean;
    onSave: (name: string) => void;
  } = $props();

  // useDraft: a local draft that resets whenever the saved name changes
  // (including an optimistic rollback).
  let draft = $derived(name);

  const commit = () => {
    const next = draft.trim().slice(0, EPIC_NAME_MAX);
    if (!next) draft = name;
    else if (next !== name) onSave(next);
  };
</script>

<Textarea
  aria-label="Epic name"
  bind:value={draft}
  rows={1}
  maxlength={EPIC_NAME_MAX}
  readonly={!canWrite}
  onblur={commit}
  onkeydown={(e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      draft = name;
      e.currentTarget.blur();
    }
  }}
  class="min-h-0 flex-1 resize-none border-transparent bg-transparent px-1 py-0.5 text-xl font-medium shadow-none hover:border-border dark:bg-transparent"
/>
