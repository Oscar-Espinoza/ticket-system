<!-- Confirm-and-delete for one document. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { toast } from 'svelte-sonner';

  import { deleteDocument } from '@/lib/actions/documents';
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

  let {
    document,
    onOpenChange,
    onDeleted,
  }: {
    document: { id: string; title: string } | null;
    onOpenChange: (open: boolean) => void;
    onDeleted: () => void;
  } = $props();

  let pending = $state(false);
</script>

<AlertDialog open={document !== null} {onOpenChange}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{m.auth_docs_delete_title({ title: document?.title ?? '' })}</AlertDialogTitle>
      <AlertDialogDescription>{m.auth_docs_delete_description()}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
      <AlertDialogAction
        variant="destructive"
        disabled={pending}
        onclick={() => {
          const target = document;
          if (!target) return;
          pending = true;
          void (async () => {
            try {
              const result = await deleteDocument({ id: target.id });
              if (!result.ok) toast.error(result.error);
              else {
                toast.success(m.auth_docs_deleted());
                onDeleted();
              }
            } finally {
              pending = false;
            }
          })();
        }}
      >
        {m.common_delete()}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
