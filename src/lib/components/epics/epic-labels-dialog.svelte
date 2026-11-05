<script lang="ts">
  import PlusIcon from '@lucide/svelte/icons/plus';
  import { toast } from 'svelte-sonner';

  import { createEpicLabel } from '@/lib/actions/epic-labels';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { EPIC_COLORS, EPIC_LABEL_NAME_MAX, type EpicLabelRow } from '@/components/epics/epic-model';
  import ColorButton from './epic-label-color-button.svelte';
  import EpicLabelRowEditor from './epic-label-row-editor.svelte';

  const randomColor = () => EPIC_COLORS[Math.floor(Math.random() * EPIC_COLORS.length)];

  let {
    open = $bindable(false),
    onOpenChange,
    projectId,
    labels,
    usage,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectId: string;
    labels: EpicLabelRow[];
    /** Epics per label id. */
    usage: Map<string, number>;
  } = $props();

  let name = $state('');
  let color = $state(EPIC_COLORS[0]);
  let pending = $state(false);

  async function create() {
    if (!name.trim()) return;
    pending = true;
    try {
      const result = await createEpicLabel({ projectId, name, color });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      name = '';
      color = randomColor();
    } finally {
      pending = false;
    }
  }
</script>

<Dialog
  bind:open={
    () => open,
    (next) => {
      open = next;
      onOpenChange(next);
    }
  }
>
  <DialogContent class="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Epic labels</DialogTitle>
      <DialogDescription>
        Tag epics to group and filter them. Separate from issue labels.
      </DialogDescription>
    </DialogHeader>

    <ul class="-mx-1 flex max-h-80 flex-col overflow-y-auto">
      {#if labels.length === 0}
        <li class="px-1 py-3 text-sm text-muted-foreground">No labels yet — add one below.</li>
      {/if}
      {#each labels as label (label.id)}
        <EpicLabelRowEditor {projectId} {label} uses={usage.get(label.id) ?? 0} />
      {/each}
    </ul>

    <form
      class="flex items-center gap-2 border-t border-border pt-3"
      onsubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <ColorButton value={color} onChange={(next) => (color = next)} />
      <Input
        aria-label="New label name"
        placeholder="New label"
        bind:value={name}
        maxlength={EPIC_LABEL_NAME_MAX}
        class="h-8"
      />
      <Button type="submit" size="sm" disabled={pending || !name.trim()}>
        <PlusIcon />
        Add
      </Button>
    </form>
  </DialogContent>
</Dialog>
