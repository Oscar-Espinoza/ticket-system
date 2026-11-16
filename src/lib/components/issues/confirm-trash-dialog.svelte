<!--
  Confirm before moving one or many issues to the trash (restorable). Open
  while `issues` is non-empty.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
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
  import type { IssueRow } from '@/lib/issue-model';

  let {
    issues,
    onOpenChange,
    onConfirm,
  }: {
    /** Open while non-empty. */
    issues: IssueRow[];
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
  } = $props();

  const one = $derived(issues.length === 1 ? issues[0] : null);
</script>

<AlertDialog open={issues.length > 0} {onOpenChange}>
  <AlertDialogContent size="sm">
    <AlertDialogHeader>
      <AlertDialogTitle>
        {one ? m.issues_trash_confirm_one({ key: one.key }) : m.issues_trash_confirm_many({ count: issues.length })}
      </AlertDialogTitle>
      <AlertDialogDescription>
        {one ? m.issues_trash_restore_one({ title: one.title }) : m.issues_trash_restore_many()}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
      <AlertDialogAction variant="destructive" onclick={onConfirm}>{m.issues_move_to_trash()}</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
