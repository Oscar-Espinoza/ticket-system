<!-- Settings → Templates: the project's issue templates with create / edit / delete. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import FileText from '@lucide/svelte/icons/file-text';
  import Plus from '@lucide/svelte/icons/plus';
  import { toast } from 'svelte-sonner';

  import { deleteTemplate, type IssueTemplate } from '@/lib/actions/templates';
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
  import { Button } from '@/lib/components/ui/button';
  import { EmptyState } from '@/lib/components/ui-icons';
  import TemplateEditor from './template-editor.svelte';
  import TemplateRow from './template-row.svelte';
  import { setCachedTemplates } from './templates-store.svelte';

  let {
    projectId,
    templates,
    canEdit,
  }: {
    projectId: string;
    templates: IssueTemplate[];
    /** Members and up; guests see the list read-only. */
    canEdit: boolean;
  } = $props();

  let editing = $state<IssueTemplate | 'new' | null>(null);
  let deleting = $state<IssueTemplate | null>(null);

  // Keep the new-issue dialog's cached list in step with this page.
  $effect(() => setCachedTemplates(projectId, templates));

  async function confirmDelete(template: IssueTemplate) {
    const result = await deleteTemplate({ projectId, id: template.id });
    if (!result.ok) toast.error(result.error);
    else toast.success(m.issues_tpl_deleted({ name: template.name }));
  }

  const editorKey = $derived(editing === 'new' ? 'new' : (editing?.id ?? 'closed'));
</script>

{#snippet newButton()}
  <Button size="sm" onclick={() => (editing = 'new')}>
    <Plus />
    {m.issues_tpl_new_button()}
  </Button>
{/snippet}

{#snippet fileTextIcon()}<FileText />{/snippet}

<div class="flex flex-col gap-4">
  {#if canEdit && templates.length > 0}
    <div>{@render newButton()}</div>
  {/if}

  {#if templates.length === 0}
    <EmptyState
      icon={fileTextIcon}
      title={m.issues_tpl_none()}
      description={m.issues_tpl_empty_description()}
      action={canEdit ? newButton : undefined}
    />
  {:else}
    <ul class="flex flex-col divide-y divide-border rounded-lg border border-border">
      {#each templates as template (template.id)}
        <TemplateRow
          {template}
          {canEdit}
          onEdit={() => (editing = template)}
          onDelete={() => (deleting = template)}
        />
      {/each}
    </ul>
  {/if}

  {#key editorKey}
    <TemplateEditor
      {projectId}
      template={editing === 'new' ? null : editing}
      open={editing !== null}
      onClose={() => (editing = null)}
    />
  {/key}

  <AlertDialog bind:open={() => deleting !== null, (open) => !open && (deleting = null)}>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>{m.issues_tpl_delete_title({ name: deleting?.name ?? '' })}</AlertDialogTitle>
        <AlertDialogDescription>
          {m.issues_tpl_delete_description()}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onclick={() => {
            if (deleting) void confirmDelete(deleting);
            deleting = null;
          }}
        >
          {m.common_delete()}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
