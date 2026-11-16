<!-- Create / edit dialog for an issue template. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
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
      toast.success(template ? m.issues_tpl_updated() : m.issues_tpl_created({ name: result.template.name }));
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
      <DialogTitle>{template ? m.issues_tpl_edit() : m.issues_tpl_new()}</DialogTitle>
      <DialogDescription>{m.issues_tpl_description()}</DialogDescription>
    </DialogHeader>
    <form onsubmit={submit} class="flex flex-col gap-4">
      <Field id="{uid}-name" label={m.issues_tpl_name()} error={fieldError('name')}>
        <!-- svelte-ignore a11y_autofocus -->
        <Input
          id="{uid}-name"
          bind:value={name}
          placeholder={m.issues_tpl_name_placeholder()}
          maxlength={60}
          autofocus
          aria-invalid={fieldError('name') ? true : undefined}
        />
      </Field>
      <Field
        id="{uid}-title"
        label={m.issues_tpl_title()}
        hint={m.issues_tpl_title_hint()}
        error={fieldError('title')}
      >
        <Input id="{uid}-title" bind:value={title} placeholder={m.issues_tpl_title_placeholder()} maxlength={200} />
      </Field>
      <div class="flex flex-col gap-1.5">
        <Label for="{uid}-description">{m.common_description()}</Label>
        <Textarea
          id="{uid}-description"
          bind:value={description}
          placeholder={m.issues_tpl_description_placeholder()}
          rows={6}
        />
        {#if fieldError('description')}
          <p role="alert" class="text-xs text-destructive">{fieldError('description')}</p>
        {/if}
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{m.issues_tpl_default_properties()}</span>
        <PropertyChips
          value={properties}
          onChange={(patch) => (properties = { ...properties, ...patch })}
          showDueDate={false}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onclick={onClose}>{m.common_cancel()}</Button>
        <Button type="submit" disabled={saving || !name.trim()}>
          {template ? m.common_save() : m.issues_tpl_create()}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
