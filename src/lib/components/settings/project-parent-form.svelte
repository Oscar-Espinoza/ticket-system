<script lang="ts">
  import { untrack } from 'svelte';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';

  import { updateProjectParent, type ProjectSettingsState } from '@/lib/actions/project-settings';
  import { Button } from '@/lib/components/ui/button';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/lib/components/ui/select';
  import { createActionState, useResultToast } from './action-state.svelte';
  import Field from './field.svelte';
  import type { ProjectGeneralFormProps } from './project-general-form.svelte';

  const NO_PARENT = 'none';

  let { projectId, workspaceId, parentId, parentOptions, canEdit }: ProjectGeneralFormProps =
    $props();

  const form = createActionState<ProjectSettingsState>(updateProjectParent, {});
  useResultToast(() => form.state, 'Parent team updated');
  let value = $state(untrack(() => parentId ?? NO_PARENT));
  const disabled = $derived(!canEdit || !workspaceId);
  const items = $derived([
    { value: NO_PARENT, label: 'No parent' },
    ...parentOptions.map((option) => ({
      value: option.id,
      label: `${option.ticketKey} ${option.name}`,
    })),
  ]);
  const selected = $derived(parentOptions.find((option) => option.id === value));
</script>

<form onsubmit={form.onsubmit} class="flex flex-col gap-3" novalidate>
  <input type="hidden" name="projectId" value={projectId} />
  <input type="hidden" name="parentId" value={value === NO_PARENT ? '' : value} />
  <Field
    id="project-parent"
    label="Parent team"
    hint="Sub-teams are listed under their parent in the sidebar and workspace. Issues stay separate."
    error={form.state.errors?.parentId}
  >
    <Select bind:value {items} {disabled}>
      <SelectTrigger id="project-parent" class="w-full max-w-xs">
        <SelectValue>
          {#if selected}
            <span class="font-mono text-xs text-muted-foreground">{selected.ticketKey}</span>
            {selected.name}
          {:else}
            No parent
          {/if}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_PARENT}>No parent</SelectItem>
        {#each parentOptions as option (option.id)}
          <SelectItem value={option.id}>
            <span class="font-mono text-xs text-muted-foreground">{option.ticketKey}</span>
            {option.name}
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </Field>
  {#if !disabled}
    <div>
      <Button
        type="submit"
        variant="outline"
        disabled={form.pending || value === (parentId ?? NO_PARENT)}
      >
        {#if form.pending}<Loader2Icon class="animate-spin" />{/if}
        Save parent
      </Button>
    </div>
  {/if}
</form>
