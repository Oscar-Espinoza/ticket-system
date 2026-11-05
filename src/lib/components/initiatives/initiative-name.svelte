<!-- initiative-detail.tsx InitiativeName. -->
<script lang="ts">
  import { Textarea } from '@/lib/components/ui/textarea';
  import { INITIATIVE_NAME_MAX } from '@/components/initiatives/initiative-model';

  let { name, onSave }: { name: string; onSave: (name: string) => void } = $props();

  // useDraft: a local draft that resets whenever the saved name changes.
  let draft = $derived(name);

  const commit = () => {
    const next = draft.trim().slice(0, INITIATIVE_NAME_MAX);
    if (!next) draft = name;
    else if (next !== name) onSave(next);
  };
</script>

<Textarea
  aria-label="Initiative name"
  bind:value={draft}
  rows={1}
  maxlength={INITIATIVE_NAME_MAX}
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
