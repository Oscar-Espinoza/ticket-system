<script lang="ts">
  import { untrack } from 'svelte';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { updateProjectDetails, type ProjectSettingsState } from '@/lib/actions/project-settings';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/lib/components/ui/select';
  import { Textarea } from '@/lib/components/ui/textarea';
  import { ESTIMATE_SCALES, ESTIMATE_SCALE_LABEL, isEstimateScale } from '@/lib/estimates';
  import { createActionState, useResultToast } from './action-state.svelte';
  import Field from './field.svelte';
  import type { ProjectGeneralFormProps } from './project-general-form.svelte';

  let { projectId, name, description, estimateScale, canEdit }: ProjectGeneralFormProps = $props();

  const form = createActionState<ProjectSettingsState>(updateProjectDetails, {});
  useResultToast(() => form.state, 'Project updated');
  const errors = $derived(form.state.errors ?? {});

  let scale = $state(untrack(() => (isEstimateScale(estimateScale) ? estimateScale : 'none')));
  const scaleItems = ESTIMATE_SCALES.map((value) => ({ value, label: ESTIMATE_SCALE_LABEL[value] }));
</script>

<form onsubmit={form.onsubmit} class="flex flex-col gap-5" novalidate>
  <input type="hidden" name="projectId" value={projectId} />
  <fieldset disabled={!canEdit} class="flex flex-col gap-5">
    <Field id="project-name" label="Name" error={errors.name}>
      <Input
        id="project-name"
        name="name"
        value={name}
        maxlength={100}
        required
        aria-invalid={!!errors.name}
        aria-describedby={errors.name ? 'project-name-error' : undefined}
      />
    </Field>
    <Field id="project-description" label="Description" error={errors.description}>
      <Textarea
        id="project-description"
        name="description"
        value={description}
        maxlength={2000}
        rows={3}
        placeholder="What does this project work on?"
        aria-invalid={!!errors.description}
      />
    </Field>
    <Field
      id="project-estimates"
      label="Estimates"
      hint="The point scale offered when estimating issues."
      error={errors.estimateScale}
    >
      <Select name="estimateScale" bind:value={scale} items={scaleItems} disabled={!canEdit}>
        <SelectTrigger id="project-estimates" class="w-full max-w-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {#each ESTIMATE_SCALES as option (option)}
            <SelectItem value={option}>
              {ESTIMATE_SCALE_LABEL[option]}
            </SelectItem>
          {/each}
        </SelectContent>
      </Select>
    </Field>
  </fieldset>
  {#if canEdit}
    <div>
      <Button type="submit" disabled={form.pending}>
        {#if form.pending}<Loader2Icon class="animate-spin" />{/if}
        Save changes
      </Button>
    </div>
  {/if}
</form>
