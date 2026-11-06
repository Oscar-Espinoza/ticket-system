<!--
  Create (no `cycle`) or edit. `suggested` pre-fills new cycles' dates — the
  day after the latest cycle, for the project's duration.
-->
<script module lang="ts">
  import type { CycleLike } from '@/lib/cycle-utils';

  export interface EditableCycle extends CycleLike {
    id: string;
    description?: string | null;
  }
</script>

<script lang="ts">
  import { Dialog, DialogContent } from '@/lib/components/ui/dialog';
  import CycleForm from './cycle-form.svelte';

  let {
    projectId,
    open = $bindable(false),
    onOpenChange,
    cycle,
    suggested,
  }: {
    projectId: string;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    cycle?: EditableCycle;
    suggested?: { startsAt: Date; endsAt: Date };
  } = $props();

  const setOpen = (next: boolean) => {
    open = next;
    onOpenChange?.(next);
  };
</script>

<Dialog bind:open={() => open, setOpen}>
  <DialogContent class="sm:max-w-md">
    <!-- Remount per open so the fields reset to the props. -->
    {#if open}
      <CycleForm {projectId} {cycle} {suggested} onDone={() => setOpen(false)} />
    {/if}
  </DialogContent>
</Dialog>
