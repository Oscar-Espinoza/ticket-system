<!-- Rename / re-describe / (un)share a saved view. -->
<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { updateView } from '@/lib/actions/views';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Switch } from '@/lib/components/ui/switch';
  import { Textarea } from '@/lib/components/ui/textarea';
  import type { ViewListItem } from './view-list.svelte';

  let { view, onClose }: { view: ViewListItem; onClose: () => void } = $props();

  const uid = $props.id();
  // Seeded once per mount (the list remounts this per view with {#key}).
  // svelte-ignore state_referenced_locally
  let name = $state(view.name);
  // svelte-ignore state_referenced_locally
  let description = $state(view.description ?? '');
  // svelte-ignore state_referenced_locally
  let shared = $state(view.shared);
  let error = $state<string | null>(null);
  let pending = $state(false);

  async function save() {
    pending = true;
    try {
      const result = await updateView({
        id: view.id,
        name,
        description,
        // Only send `shared` when it changed — sharing needs write access.
        ...(shared !== view.shared && { shared }),
      });
      if (!result.ok) {
        error = result.error;
        return;
      }
      toast.success('View updated');
      // The action wrapper already refreshed the page data.
      onClose();
    } finally {
      pending = false;
    }
  }
</script>

<Dialog open onOpenChange={(open) => !open && onClose()}>
  <DialogContent class="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Edit view</DialogTitle>
      <DialogDescription class="sr-only">Rename or re-describe this view.</DialogDescription>
    </DialogHeader>
    <form
      class="flex flex-col gap-4"
      onsubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div class="flex flex-col gap-1.5">
        <Label for={`${uid}-name`}>Name</Label>
        <!-- svelte-ignore a11y_autofocus -->
        <Input
          id={`${uid}-name`}
          bind:value={() => name, (v) => {
            name = v ?? '';
            error = null;
          }}
          maxlength={80}
          autofocus
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for={`${uid}-description`}>Description</Label>
        <Textarea id={`${uid}-description`} bind:value={description} maxlength={500} rows={2} />
      </div>
      {#if view.canShare || view.shared}
        <div class="flex items-center justify-between gap-4">
          <Label for={`${uid}-shared`}>Share with project</Label>
          <Switch id={`${uid}-shared`} bind:checked={shared} disabled={!view.canShare} />
        </div>
      {/if}
      {#if error}
        <p class="text-sm text-destructive">{error}</p>
      {/if}
      <DialogFooter>
        <Button type="button" variant="outline" onclick={onClose}>Cancel</Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {#if pending}<Loader2Icon class="animate-spin" />{/if}
          Save
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
