<script lang="ts">
  import { m } from '@/lib/i18n';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { deleteProjectTemplate, type ProjectTemplateRow } from '@/lib/actions/project-templates';
  import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import { invalidateProjectTemplates } from './template-select.svelte.ts';

  let { template, onClose }: { template: ProjectTemplateRow | null; onClose: () => void } =
    $props();

  let pending = $state(false);

  async function confirm() {
    const target = template;
    if (!target) return;
    pending = true;
    try {
      const result = await deleteProjectTemplate({ id: target.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      invalidateProjectTemplates();
      toast.success(m.projects_template_deleted({ name: target.name }));
      onClose();
    } finally {
      pending = false;
    }
  }
</script>

<AlertDialog
  open={template !== null}
  onOpenChange={(open) => {
    if (!open) onClose();
  }}
>
  <AlertDialogContent size="sm">
    <AlertDialogHeader>
      <AlertDialogTitle>{m.projects_template_delete_title({ name: template?.name ?? '' })}</AlertDialogTitle>
      <AlertDialogDescription>
        {m.projects_template_delete_desc()}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
      <Button variant="destructive" onclick={confirm} disabled={pending}>
        {#if pending}<Loader2Icon class="animate-spin" />{/if}
        {m.common_delete()}
      </Button>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
