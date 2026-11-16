<script lang="ts">
  import { m } from '@/lib/i18n';
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
  useResultToast(() => form.state, m.settings_project_deleted_toast());
  let confirm = $state('');
</script>

<section class="flex flex-col gap-3">
  <div>
    <h2 class="text-base font-medium text-destructive">{m.settings_project_delete_title()}</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      {m.settings_project_delete_desc()}
    </p>
  </div>
  <AlertDialog
    onOpenChange={(open) => {
      if (!open) confirm = '';
    }}
  >
    <AlertDialogTrigger>
      {#snippet child({ props })}
        <Button {...props} variant="destructive" class="w-fit">{m.settings_project_delete_menu()}</Button>
      {/snippet}
    </AlertDialogTrigger>
    <AlertDialogContent>
      <form onsubmit={form.onsubmit} class="contents">
        <input type="hidden" name="projectId" value={projectId} />
        <AlertDialogHeader>
          <AlertDialogTitle>{m.settings_project_delete_confirm_title({ name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {@const parts = m.settings_project_delete_confirm_desc({ name: '\u0000' }).split('\u0000')}
            {parts[0]}<strong class="text-foreground">{name}</strong>{parts[1]}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field id="delete-confirm" label={m.settings_project_name_field()} error={form.state.errors?.confirm}>
          <Input
            id="delete-confirm"
            name="confirm"
            bind:value={confirm}
            autocomplete="off"
            aria-invalid={!!form.state.errors?.confirm}
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">{m.common_cancel()}</AlertDialogCancel>
          <Button
            type="submit"
            variant="destructive"
            disabled={form.pending || confirm.trim() !== name}
          >
            {#if form.pending}<Loader2Icon class="animate-spin" />{/if}
            {m.settings_project_delete_title()}
          </Button>
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  </AlertDialog>
</section>
