<!-- Confirm deleting a saved view. -->
<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { deleteView } from '@/lib/actions/views';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';
  import type { ViewListItem } from './view-list.svelte';

  let { view, onClose }: { view: ViewListItem | null; onClose: () => void } = $props();

  let pending = $state(false);

  async function confirm() {
    if (!view) return;
    const target = view;
    pending = true;
    try {
      const result = await deleteView({ id: target.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted “${target.name}”`);
      // The action wrapper already refreshed the page data (router.refresh()).
      onClose();
    } finally {
      pending = false;
    }
  }
</script>

<AlertDialog open={view !== null} onOpenChange={(open) => !open && onClose()}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete “{view?.name}”?</AlertDialogTitle>
      <AlertDialogDescription>
        {view?.shared
          ? 'This view is shared — it disappears for everyone in the project. Issues are not affected.'
          : 'The view is removed. Issues are not affected.'}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
      <AlertDialogAction
        variant="destructive"
        disabled={pending}
        onclick={(event: MouseEvent) => {
          // Keep the dialog open until the delete settles.
          event.preventDefault();
          void confirm();
        }}
      >
        {#if pending}<Loader2Icon class="animate-spin" />{/if}
        Delete view
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
