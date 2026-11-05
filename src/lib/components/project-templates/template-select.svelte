<!--
  Template picker for the create-project dialogs. Templates come from
  useProjectTemplates(enabled) (template-select.svelte.ts, re-exported below).
  `templates` is undefined while loading; `value` '' = default workflow.
-->
<script module lang="ts">
  export { invalidateProjectTemplates, useProjectTemplates } from './template-select.svelte.ts';

  const DEFAULT = 'default';
</script>

<script lang="ts">
  import type { ProjectTemplateRow } from '@/lib/actions/project-templates';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/lib/components/ui/select';

  let {
    id,
    templates,
    value,
    onChange,
  }: {
    id?: string;
    templates: ProjectTemplateRow[] | undefined;
    /** '' = default workflow. */
    value: string;
    onChange: (templateId: string) => void;
  } = $props();

  const known = $derived(!value || templates?.some((t) => t.id === value));
  const current = $derived(known ? value || DEFAULT : DEFAULT);
  const selected = $derived(templates?.find((t) => t.id === current));
  const items = $derived([
    { value: DEFAULT, label: 'Default workflow' },
    ...(templates ?? []).map((t) => ({ value: t.id, label: t.name })),
  ]);
</script>

<Select
  bind:value={() => current, (next) => onChange(next === DEFAULT ? '' : next)}
  {items}
>
  <SelectTrigger {id} class="w-full">
    <SelectValue>
      {#if selected}
        <span class="truncate">{selected.name}</span>
        {#if selected.workspaceName}
          <span class="text-xs text-muted-foreground">· {selected.workspaceName}</span>
        {/if}
      {:else}
        Default workflow
      {/if}
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value={DEFAULT}>Default workflow</SelectItem>
    {#if templates === undefined}
      <SelectItem value="__loading" disabled>Loading templates…</SelectItem>
    {:else}
      {#each templates as template (template.id)}
        <SelectItem value={template.id}>
          <span class="truncate">{template.name}</span>
          {#if template.workspaceName}
            <span class="text-xs text-muted-foreground">· {template.workspaceName}</span>
          {/if}
        </SelectItem>
      {/each}
    {/if}
  </SelectContent>
</Select>
