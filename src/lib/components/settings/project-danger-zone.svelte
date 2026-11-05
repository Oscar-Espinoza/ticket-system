<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { deleteProject, type ProjectSettingsState } from '@/lib/actions/project-settings';
  import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { createActionState, useResultToast } from './action-state.svelte';
  import Field from './field.svelte';

  let { projectId, name }: { projectId: string; name: string } = $props();

  const form = createActionState<ProjectSettingsState>(deleteProject, {});
  useResultToast(() => form.state, 'Project deleted');
  let confirm = $state('');
</script>

<section class="flex flex-col gap-3">
  <div>
    <h2 class="text-base font-medium text-destructive">Delete project</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      Permanently deletes the project with all of its issues, comments, cycles and settings. Members
      lose access immediately.
    </p>
  </div>
  <AlertDialog
    onOpenChange={(open) => {
      if (!open) confirm = '';
    }}
  >
    <AlertDialogTrigger>
      {#snippet child({ props })}
        <Button {...props} variant="destructive" class="w-fit">Delete project…</Button>
      {/snippet}
    </AlertDialogTrigger>
    <AlertDialogContent>
      <form onsubmit={form.onsubmit} class="contents">
        <input type="hidden" name="projectId" value={projectId} />
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This can&rsquo;t be undone. Type <strong class="text-foreground">{name}</strong> to
            confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field id="delete-confirm" label="Project name" error={form.state.errors?.confirm}>
          <Input
            id="delete-confirm"
            name="confirm"
            bind:value={confirm}
            autocomplete="off"
            aria-invalid={!!form.state.errors?.confirm}
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
          <Button
            type="submit"
            variant="destructive"
            disabled={form.pending || confirm.trim() !== name}
          >
            {#if form.pending}<Loader2Icon class="animate-spin" />{/if}
            Delete project
          </Button>
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  </AlertDialog>
</section>
