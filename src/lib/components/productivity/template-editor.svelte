<!-- Create / edit dialog for an issue template. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';

  import { createTemplate, updateTemplate, type IssueTemplate } from '@/lib/actions/templates';
  import Field from '@/lib/components/settings/field.svelte';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Textarea } from '@/lib/components/ui/textarea';
  import type { IssuePatch } from '@/lib/issue-model';
  import PropertyChips from './property-chips.svelte';
  import { templateProps } from './templates-store.svelte';

  let {
    projectId,
    template,
    open,
    onClose,
  }: {
    projectId: string;
    /** null = new template. */
    template: IssueTemplate | null;
    open: boolean;
    onClose: () => void;
  } = $props();

  const data = useProjectData();
  const uid = $props.id();
  // Seeded once; the parent remounts the editor per template ({#key}).
  const seed = untrack(() => template);
  let name = $state(seed?.name ?? '');
  let title = $state(seed?.title ?? '');
  let description = $state(seed?.description ?? '');
  let properties = $state<IssuePatch>(seed ? templateProps(seed, data) : {});
  let errors = $state<{ field?: string; message: string } | null>(null);
  let saving = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    try {
      const input = { projectId, name, title, description, data: $state.snapshot(properties) };
      const result = template
        ? await updateTemplate({ ...input, id: template.id })
        : await createTemplate(input);
      if (!result.ok) {
        errors = { field: result.field, message: result.error };
        if (!result.field) toast.error(result.error);
        return;
      }
      toast.success(template ? 'Template updated' : `Created template “${result.template.name}”`);
      onClose();
    } finally {
      saving = false;
    }
  }

  const fieldError = (field: string) => (errors?.field === field ? errors.message : undefined);
</script>

<Dialog bind:open={() => open, (next) => !next && onClose()}>
  <DialogContent class="sm:max-w-xl">
    <DialogHeader>
      <DialogTitle>{template ? 'Edit template' : 'New template'}</DialogTitle>
      <DialogDescription>New issues from this template start with these values.</DialogDescription>
    </DialogHeader>
    <form onsubmit={submit} class="flex flex-col gap-4">
      <Field id="{uid}-name" label="Template name" error={fieldError('name')}>
        <!-- svelte-ignore a11y_autofocus -->
        <Input
          id="{uid}-name"
          bind:value={name}
          placeholder="Bug report"
          maxlength={60}
          autofocus
          aria-invalid={fieldError('name') ? true : undefined}
        />
      </Field>
      <Field
        id="{uid}-title"
        label="Issue title"
        hint="Optional — prefilled when the new issue's title is empty."
        error={fieldError('title')}
      >
        <Input id="{uid}-title" bind:value={title} placeholder="Bug: " maxlength={200} />
      </Field>
      <div class="flex flex-col gap-1.5">
        <Label for="{uid}-description">Description</Label>
        <Textarea
          id="{uid}-description"
          bind:value={description}
          placeholder={'## Steps to reproduce\n\n## Expected\n\n## Actual'}
          rows={6}
        />
        {#if fieldError('description')}
          <p role="alert" class="text-xs text-destructive">{fieldError('description')}</p>
        {/if}
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">Default properties</span>
        <PropertyChips
          value={properties}
          onChange={(patch) => (properties = { ...properties, ...patch })}
          showDueDate={false}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onclick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving || !name.trim()}>
          {template ? 'Save' : 'Create template'}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
