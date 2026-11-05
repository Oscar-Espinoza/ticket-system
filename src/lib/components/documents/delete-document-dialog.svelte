<!-- Confirm-and-delete for one document (DeleteDocumentDialog of documents-list.tsx). -->
<script lang="ts">
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
      <AlertDialogTitle>Delete “{document?.title}”?</AlertDialogTitle>
      <AlertDialogDescription>
        The document and its edit history are removed for everyone. This can’t be undone — archive it to keep a copy.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
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
                toast.success('Document deleted');
                onDeleted();
              }
            } finally {
              pending = false;
            }
          })();
        }}
      >
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
