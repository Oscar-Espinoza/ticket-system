<!-- One row of the epic-labels dialog (epic-labels.tsx EpicLabelRowEditor). -->
<script lang="ts">
  import CheckIcon from '@lucide/svelte/icons/check';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import { toast } from 'svelte-sonner';

  import { deleteEpicLabel, updateEpicLabel } from '@/lib/actions/epic-labels';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { EPIC_LABEL_NAME_MAX, type EpicLabelRow } from '@/components/epics/epic-model';
  import ColorButton from './epic-label-color-button.svelte';

  let {
    projectId,
    label,
    uses,
  }: {
    projectId: string;
    label: EpicLabelRow;
    uses: number;
  } = $props();

  // useDraft: a local draft that resets whenever the saved name changes.
  let draft = $derived(label.name);
  let confirming = $state(false);
  let running = 0;
  let pending = $state(false);

  async function transition(fn: () => Promise<void>) {
    running += 1;
    pending = true;
    try {
      await fn();
    } finally {
      running -= 1;
      if (running === 0) pending = false;
    }
  }

  const update = (patch: { name?: string; color?: string }) =>
    transition(async () => {
      const result = await updateEpicLabel({ projectId, id: label.id, ...patch });
      if (!result.ok) {
        toast.error(result.error);
        draft = label.name;
      }
    });

  const commitName = () => {
    const next = draft.trim();
    if (!next) draft = label.name;
    else if (next !== label.name) void update({ name: next });
  };

  const remove = () =>
    transition(async () => {
      const result = await deleteEpicLabel({ projectId, id: label.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`Deleted label “${label.name}”`);
    });
</script>

<li class="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/40">
  <ColorButton value={label.color} onChange={(color) => void update({ color })} />
  <Input
    aria-label={`Rename ${label.name}`}
    bind:value={draft}
    maxlength={EPIC_LABEL_NAME_MAX}
    disabled={pending}
    onblur={commitName}
    onkeydown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        draft = label.name;
      }
    }}
    class="h-7 border-transparent bg-transparent px-1.5 shadow-none hover:border-border dark:bg-transparent"
  />
  <span class="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
    {uses} {uses === 1 ? 'epic' : 'epics'}
  </span>
  {#if confirming}
    <span class="flex shrink-0 items-center gap-1">
      <Button size="xs" variant="destructive" disabled={pending} onclick={remove}>
        <CheckIcon />
        Delete
      </Button>
      <Button size="xs" variant="ghost" onclick={() => (confirming = false)}>Cancel</Button>
    </span>
  {:else}
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Delete ${label.name}`}
      class="shrink-0 text-muted-foreground"
      onclick={() => (confirming = true)}
    >
      <Trash2Icon />
    </Button>
  {/if}
</li>
