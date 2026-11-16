<script lang="ts">
  import { m } from '@/lib/i18n';
  import { untrack } from 'svelte';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import {
    updateProjectVisibility,
    type ProjectSettingsState,
    type ProjectVisibility,
  } from '@/lib/actions/project-settings';
  import { Button } from '@/lib/components/ui/button';
  import { Label } from '@/lib/components/ui/label';
  import { RadioGroup, RadioGroupItem } from '@/lib/components/ui/radio-group';
  import { createActionState, useResultToast } from './action-state.svelte';
  import type { ProjectGeneralFormProps } from './project-general-types';

  const VISIBILITY_COPY: Record<ProjectVisibility, { label: string; hint: string }> = {
    private: {
      label: m.settings_project_vis_private(),
      hint: m.settings_project_vis_private_hint(),
    },
    workspace: {
      label: m.settings_project_vis_workspace(),
      hint: m.settings_project_vis_workspace_hint(),
    },
  };

  const OPTIONS = Object.keys(VISIBILITY_COPY) as ProjectVisibility[];

  let { projectId, visibility, workspaceId, canEdit }: ProjectGeneralFormProps = $props();

  const form = createActionState<ProjectSettingsState>(updateProjectVisibility, {});
  useResultToast(() => form.state, m.settings_project_visibility_updated_toast());
  let value = $state<ProjectVisibility>(untrack(() => visibility));
  const disabled = $derived(!canEdit || !workspaceId);
</script>

<form onsubmit={form.onsubmit} class="flex flex-col gap-3" novalidate>
  <input type="hidden" name="projectId" value={projectId} />
  <input type="hidden" name="visibility" {value} />
  <fieldset class="flex flex-col gap-2" {disabled}>
    <legend class="mb-2 text-sm font-medium">{m.settings_project_visibility()}</legend>
    <RadioGroup
      {value}
      onValueChange={(next) => (value = next as ProjectVisibility)}
      {disabled}
      class="gap-3"
    >
      {#each OPTIONS as option (option)}
        <div class="flex items-start gap-2.5">
          <RadioGroupItem id="visibility-{option}" value={option} class="mt-0.5" />
          <Label for="visibility-{option}" class="flex flex-col items-start gap-0.5">
            <span>{VISIBILITY_COPY[option].label}</span>
            <span class="text-xs font-normal text-muted-foreground">
              {VISIBILITY_COPY[option].hint}
            </span>
          </Label>
        </div>
      {/each}
    </RadioGroup>
    {#if form.state.errors?.visibility}
      <p role="alert" class="text-xs text-destructive">
        {form.state.errors.visibility}
      </p>
    {/if}
  </fieldset>
  {#if !disabled}
    <div>
      <Button type="submit" variant="outline" disabled={form.pending || value === visibility}>
        {#if form.pending}<Loader2Icon class="animate-spin" />{/if}
        {m.settings_project_save_visibility()}
      </Button>
    </div>
  {/if}
</form>
