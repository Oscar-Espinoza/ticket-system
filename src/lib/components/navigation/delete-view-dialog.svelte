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
  import { m } from '@/lib/i18n';
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
      toast.success(m.editor_view_deleted({ name: target.name }));
      // The action wrapper already refreshed the page data.
      onClose();
    } finally {
      pending = false;
    }
  }
</script>

<AlertDialog open={view !== null} onOpenChange={(open) => !open && onClose()}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{m.editor_view_delete_title({ name: view?.name ?? '' })}</AlertDialogTitle>
      <AlertDialogDescription>
        {view?.shared
          ? m.editor_view_delete_shared()
          : m.editor_view_delete_private()}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={pending}>{m.common_cancel()}</AlertDialogCancel>
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
        {m.editor_view_delete()}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
