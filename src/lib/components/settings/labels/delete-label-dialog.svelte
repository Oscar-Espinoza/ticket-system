<script lang="ts">
  import { toast } from 'svelte-sonner';

  import { deleteLabel } from '@/lib/actions/labels';
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
  import type { ProjectLabel } from '@/lib/project-data-types';
  import { pluralize } from '@/lib/format';

  let {
    projectId,
    label,
    count,
    onClose,
  }: {
    projectId: string;
    label: ProjectLabel | null;
    count: number;
    onClose: () => void;
  } = $props();

  let isPending = $state(false);

  async function confirm() {
    // The dialog closes right after this handler (onClose nulls `label`), so
    // keep the label this run is for.
    const target = label;
    if (!target) return;
    isPending = true;
    try {
      const result = await deleteLabel({ projectId, id: target.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`Deleted “${target.name}”`);
      onClose();
    } finally {
      isPending = false;
    }
  }
</script>

<AlertDialog
  open={label !== null}
  onOpenChange={(open) => {
    if (!open) onClose();
  }}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete “{label?.name}”?</AlertDialogTitle>
      <AlertDialogDescription>
        {count > 0
          ? `It will be removed from ${pluralize(count, 'issue')}. This can’t be undone.`
          : 'No issues use this label. This can’t be undone.'}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction variant="destructive" onclick={confirm} disabled={isPending}>
        Delete label
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
