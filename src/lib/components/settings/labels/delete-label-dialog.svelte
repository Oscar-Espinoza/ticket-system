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
  import { m } from '@/lib/i18n';

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
      else toast.success(m.settings_labels_deleted_toast({ name: target.name }));
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
      <AlertDialogTitle>{m.settings_labels_delete_title({ name: label?.name ?? '' })}</AlertDialogTitle>
      <AlertDialogDescription>
        {count > 0
          ? m.settings_labels_delete_in_use({ issues: m.common_issue_count({ count }) })
          : m.settings_labels_delete_unused()}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
      <AlertDialogAction variant="destructive" onclick={confirm} disabled={isPending}>
        {m.settings_labels_delete_label()}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
