<!--
  Confirm before moving one or many issues to the trash (restorable). Open
  while `issues` is non-empty. (ConfirmTrashDialog in issue-context-menu.tsx)
-->
<script lang="ts">
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
        {one ? `Move ${one.key} to trash?` : `Move ${issues.length} issues to trash?`}
      </AlertDialogTitle>
      <AlertDialogDescription>
        {one ? `${one.title} — you` : 'You'} can restore {one ? 'it' : 'them'} from the trash.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction variant="destructive" onclick={onConfirm}>Move to trash</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
